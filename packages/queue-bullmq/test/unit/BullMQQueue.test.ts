import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job, JobSerializer, type JobRunner } from '@nuxt-laravelize/queue/runtime'
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

const add = vi.fn(async (_name: string, _data: unknown, _options: unknown) => ({ id: 'bull-1' }))
vi.mock('bullmq', () => ({ Queue: class { add = add; count = vi.fn(); obliterate = vi.fn(); close = vi.fn() } }))

class ProbeJob extends Job {
  static override readonly priority = 12
  readonly payload = { value: 1 }
  handle() {}
}

describe('BullMQQueue', () => {
  beforeEach(() => add.mockClear())

  it('pushes metadata from the required shared serializer', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const serializer = new JobSerializer()
    serializer.contribute(() => ({ propagated: 'context' }))
    const connection = { client: {} } as never
    const runner = { run: vi.fn() } as unknown as JobRunner
    await new BullMQQueue(connection, runner, serializer).push(new ProbeJob())
    expect(add).toHaveBeenCalledWith('ProbeJob', {
      version: 2,
      name: 'ProbeJob',
      payload: { value: 1 },
      metadata: { propagated: 'context' },
    }, expect.any(Object))
  })

  it('forwards static priority and allows a validated push override', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await queue.push(new ProbeJob())
    await queue.push(new ProbeJob(), { priority: 3, tries: 4, delay: 500, backoff: 250 })

    expect(add.mock.calls[0]?.[2]).toMatchObject({ priority: 12 })
    expect(add.mock.calls[1]?.[2]).toMatchObject({ priority: 3, attempts: 4, delay: 500, backoff: { type: 'fixed', delay: 250 } })
  })

  it('omits BullMQ priority for the ordinary zero-priority class', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await queue.push(new ProbeJob(), { priority: 0 })

    expect(add.mock.calls[0]?.[2]).not.toHaveProperty('priority')
  })

  it('rejects invalid priority before mutating BullMQ', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await expect(queue.push(new ProbeJob(), { priority: 2 ** 21 + 1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
    expect(add).not.toHaveBeenCalled()
  })

  it('preserves producer construction while forwarding a scoped serializer resolver', async () => {
    const token = createToken<string>('bullmq.test-context')
    const scope = createContainer().createScope()
    scope.override(token, 'request-context')
    const serializer = new JobSerializer(undefined, scope)
    serializer.contribute((_job, resolver) => ({ propagated: resolver?.make(token) }))
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    await new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, serializer).push(new ProbeJob())
    expect(add.mock.calls[0]?.[1]).toMatchObject({ metadata: { propagated: 'request-context' } })
  })

  it('rejects job ids that BullMQ cannot persist', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await expect(queue.push(new ProbeJob(), { id: 'outbox:message' })).rejects.toThrow(/must not contain a colon/)
    expect(add).not.toHaveBeenCalled()
  })

  it('forwards bounded deduplication using an opaque hashed identifier', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await queue.push(new ProbeJob(), { deduplication: { id: 'tenant-a.report-1', ttl: 5_000 } })

    const id = `v1-${createHash('sha256').update('tenant-a.report-1').digest('base64url')}`
    expect(add.mock.calls[0]?.[2]).toMatchObject({ deduplication: { id, ttl: 5_000 } })
    expect(JSON.stringify(add.mock.calls[0]?.[2])).not.toContain('tenant-a.report-1')
  })

  it('rejects invalid deduplication before mutating BullMQ', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())

    await expect(queue.push(new ProbeJob(), { deduplication: { id: 'unsafe id' } })).rejects.toThrow('deduplication id must be a safe identifier')
    await expect(queue.push(new ProbeJob(), { deduplication: { id: 'safe', ttl: 86_400_001 } })).rejects.toThrow('deduplication ttl must be an integer between 1 and 86400000')
    await expect(queue.push(new ProbeJob(), { deduplication: { id: 'safe', replace: true } as never })).rejects.toThrow('deduplication must contain only id and optional ttl')
    await expect(queue.push(new ProbeJob(), { id: 'job-1', deduplication: { id: 'safe' } })).rejects.toThrow('id and deduplication cannot be combined')
    expect(add).not.toHaveBeenCalled()
  })
})
