/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it, vi } from 'vitest'
import { DeadLetterAmbiguousError, DeadLetterInvalidStateError, DeadLetterNotFoundError, DeadLetterStaleRevisionError, deadLetterOperationFingerprint, type DeadLetterMutationResult } from '@nuxt-laravelize/dead-letter'
import { MemoryDeadLetterOperationStore } from '@nuxt-laravelize/dead-letter/testing'
import { Job, JobSerializer, prepareQueueChain } from '@nuxt-laravelize/queue/runtime'
import { BullMQDeadLetterAdapter } from '../../src/runtime/BullMQDeadLetterAdapter.js'

const job = () => ({ id: 'job-1', name: 'mail.send', data: { secret: true }, opts: { attempts: 4 }, failedReason: 'token=hidden\nstack', attemptsMade: 3, finishedOn: 100, processedOn: 50, timestamp: 0, getState: vi.fn().mockResolvedValue('failed'), retry: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) })
class ChainPayloadJob extends Job<{ recipient: string }> {
  readonly payload: { recipient: string }
  constructor(payload: Record<string, unknown>) { super(); this.payload = payload as { recipient: string } }
  handle() {}
}
describe('BullMQDeadLetterAdapter', () => {
  it('advertises immediate retry without discard or scheduling', () => {
    expect(new BullMQDeadLetterAdapter({} as never, new MemoryDeadLetterOperationStore()).capabilities).toEqual({ retry: true, discard: false, scheduleRetry: false })
  })
  it('lists metadata only, opts into payload and fences mutations', async () => {
    const failed = job(); const queue = { name: 'emails', getJobs: vi.fn().mockResolvedValue([failed]), getJob: vi.fn().mockResolvedValue(failed) }
    const adapter = new BullMQDeadLetterAdapter(queue as never, new MemoryDeadLetterOperationStore(), () => new Date(200))
    const [summary] = (await adapter.list({ limit: 10 })).items
    expect(summary).not.toHaveProperty('payload'); expect(summary).not.toHaveProperty('error'); expect((await adapter.list({ limit: 10, includeErrorSummary: true })).items[0]?.error).toBe('token=[redacted] stack')
    expect(await adapter.get(summary!.key, { includePayload: true })).toHaveProperty('payload.secret', true)
    await expect(adapter.retry({ key: summary!.key, revision: 'wrong', operationId: 'retry-1', availableAt: new Date(0).toISOString() })).rejects.toBeInstanceOf(DeadLetterStaleRevisionError)
    expect(() => adapter.discard({ key: summary!.key, revision: summary!.revision, operationId: 'discard-1' })).toThrow(DeadLetterInvalidStateError); expect(failed.remove).not.toHaveBeenCalled()
    const request = { key: summary!.key, revision: summary!.revision, operationId: 'retry-2', availableAt: new Date(0).toISOString() }
    const result = await adapter.retry(request); expect(await adapter.retry(request)).toEqual(result); expect(failed.retry).toHaveBeenCalledOnce()
  })
  it('never exposes future chain credentials through payload inspection', async () => {
    const serializer = new JobSerializer()
    serializer.contribute(item => ({ credential: item.payload.recipient === 'opaque-1' ? 'current' : 'future-secret' }))
    const chain = prepareQueueChain([
      { job: new ChainPayloadJob({ recipient: 'opaque-1' }), options: { queue: 'emails' } },
      { job: new ChainPayloadJob({ recipient: 'opaque-2' }), options: { queue: 'emails' } },
    ], serializer, (item, _queue, currentSerializer) => currentSerializer.serialize(item), () => 'chain-1')
    const failed = { ...job(), data: chain }
    const queue = { name: 'emails', getJob: vi.fn().mockResolvedValue(failed) }
    const adapter = new BullMQDeadLetterAdapter(queue as never, new MemoryDeadLetterOperationStore())

    const detail = await adapter.get({ source: 'bullmq', namespace: 'emails', id: 'job-1' }, { includePayload: true })

    expect(detail.payload).toEqual({ recipient: 'opaque-1' })
    expect(JSON.stringify(detail.payload)).not.toContain('current')
    expect(JSON.stringify(detail.payload)).not.toContain('future-secret')

    const malformed = structuredClone(chain) as unknown as Record<string, unknown>
    delete malformed.kind
    failed.data = malformed as never
    await expect(adapter.get({ source: 'bullmq', namespace: 'emails', id: 'job-1' }, { includePayload: true })).rejects.toBeInstanceOf(DeadLetterInvalidStateError)
  })
  it('strips serialized metadata from ordinary job payload inspection', async () => {
    const serializer = new JobSerializer()
    serializer.contribute(() => ({ credential: 'ordinary-secret' }))
    const failed = { ...job(), data: serializer.serialize(new ChainPayloadJob({ recipient: 'opaque-1' })) }
    const queue = { name: 'emails', getJob: vi.fn().mockResolvedValue(failed) }
    const adapter = new BullMQDeadLetterAdapter(queue as never, new MemoryDeadLetterOperationStore())

    const detail = await adapter.get({ source: 'bullmq', namespace: 'emails', id: 'job-1' }, { includePayload: true })

    expect(detail.payload).toEqual({ recipient: 'opaque-1' })
    expect(JSON.stringify(detail.payload)).not.toContain('ordinary-secret')
  })
  it('filters across the complete bounded failed-job snapshot', async () => {
    const jobs = Array.from({ length: 55 }, (_, index) => ({ ...job(), id: `job-${index}`, name: index === 54 ? 'target' : 'other', finishedOn: index + 1 }))
    const queue = { name: 'emails', getJobs: vi.fn().mockImplementation((_states, start, end) => jobs.slice(start, end + 1)), getJob: vi.fn() }
    const page = await new BullMQDeadLetterAdapter(queue as never, new MemoryDeadLetterOperationStore()).list({ type: 'target', limit: 1 })
    expect(page.items[0]?.key.id).toBe('job-54')
    expect(queue.getJobs).toHaveBeenCalledOnce()
  })
  it.each(['waiting', 'completed'])('never exposes a %s job through direct get', async (state) => {
    const current = job(); current.getState.mockResolvedValue(state)
    const adapter = new BullMQDeadLetterAdapter({ name: 'emails', getJob: vi.fn().mockResolvedValue(current) } as never, new MemoryDeadLetterOperationStore())
    await expect(adapter.get({ source: 'bullmq', namespace: 'emails', id: 'job-1' }, { includePayload: true })).rejects.toBeInstanceOf(DeadLetterNotFoundError)
  })
  it('uses a keyset boundary so removal before the cursor does not skip later jobs', async () => {
    let jobs = Array.from({ length: 3 }, (_, index) => ({ ...job(), id: `job-${index}`, finishedOn: index + 1 }))
    const queue = { name: 'emails', getJobs: vi.fn().mockImplementation(() => jobs) }
    const adapter = new BullMQDeadLetterAdapter(queue as never, new MemoryDeadLetterOperationStore())
    const first = await adapter.list({ limit: 1 })
    jobs = jobs.slice(1)
    const second = await adapter.list({ limit: 1, cursor: first.nextCursor })
    expect(first.items[0]?.key.id).toBe('job-0'); expect(second.items[0]?.key.id).toBe('job-1')
  })
  it('rejects a failed-job source beyond the bounded snapshot capacity', async () => {
    const jobs = Array.from({ length: 1001 }, (_, index) => ({ ...job(), id: `job-${index}`, finishedOn: index + 1 }))
    const adapter = new BullMQDeadLetterAdapter({ name: 'emails', getJobs: vi.fn().mockResolvedValue(jobs) } as never, new MemoryDeadLetterOperationStore())

    await expect(adapter.list({ limit: 10 })).rejects.toThrow('more than 1000 retained failed jobs')
  })
  it.each(['committed', 'failed'] as const)('replays a raced %s reservation', async (status) => {
    const current = job(); const request = { key: { source: 'bullmq', namespace: 'emails', id: 'job-1' }, revision: 'revision', operationId: `race-${status}`, availableAt: new Date(0).toISOString() }; const hash = await deadLetterOperationFingerprint('retry', request)
    const result: DeadLetterMutationResult = { key: request.key, disposition: 'active', revision: request.revision, operationId: request.operationId, committedAt: new Date(0).toISOString() }
    const operations = { get: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(status === 'committed' ? { fingerprint: hash, status, result } : { fingerprint: hash, status, failureCode: 'stale_revision' }), reserve: vi.fn().mockResolvedValue('exists'), finalize: vi.fn() }
    const adapter = new BullMQDeadLetterAdapter({ name: 'emails', getJob: vi.fn().mockResolvedValue(current) } as never, operations)
    if (status === 'committed') await expect(adapter.retry(request)).resolves.toEqual(result)
    else await expect(adapter.retry(request)).rejects.toBeInstanceOf(DeadLetterStaleRevisionError)
    expect(current.retry).not.toHaveBeenCalled()
  })
  it('keeps a raced pending reservation ambiguous', async () => {
    const request = { key: { source: 'bullmq', namespace: 'emails', id: 'job-1' }, revision: 'revision', operationId: 'race-pending', availableAt: new Date(0).toISOString() }; const hash = await deadLetterOperationFingerprint('retry', request)
    const operations = { get: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ fingerprint: hash, status: 'pending' }), reserve: vi.fn().mockResolvedValue('exists'), finalize: vi.fn() }
    await expect(new BullMQDeadLetterAdapter({ name: 'emails' } as never, operations).retry(request)).rejects.toBeInstanceOf(DeadLetterAmbiguousError)
  })
})
