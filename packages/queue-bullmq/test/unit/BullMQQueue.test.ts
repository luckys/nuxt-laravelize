import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job, JobSerializer, type JobRunner } from '@nuxt-laravelize/queue/runtime'
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

const add = vi.fn(async (_name: string, _data: unknown, _options: unknown) => ({ id: 'bull-1' }))
const constructQueue = vi.fn()
const drain = vi.fn()
const obliterate = vi.fn()
vi.mock('bullmq', () => ({ Queue: class {
  add = add
  count = vi.fn()
  drain = drain
  obliterate = obliterate
  close = vi.fn()
  constructor(name: string, options: unknown) { constructQueue(name, options) }
} }))

class ProbeJob extends Job {
  static override readonly priority = 12
  readonly payload = { value: 1 }
  handle() {}
  override tags() { return ['report:one', 'tenant:trusted'] }
}
class InvalidTaggedJob extends ProbeJob {
  override tags() { return ['unsafe value'] }
}

describe('BullMQQueue', () => {
  beforeEach(() => {
    add.mockClear()
    constructQueue.mockClear()
    drain.mockClear()
    obliterate.mockClear()
  })

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
      metadata: { 'propagated': 'context', 'laravelize.queue.tags.v1': ['report:one', 'tenant:trusted'] },
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

  it('rejects invalid tags before constructing or mutating BullMQ', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await expect(queue.push(new InvalidTaggedJob())).rejects.toThrow('Job tags must be safe identifiers')
    expect(constructQueue).not.toHaveBeenCalled()
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

  it('forwards the connection prefix to isolate BullMQ queue namespaces', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {}, prefix: 'orders:production' } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())

    await queue.push(new ProbeJob(), { queue: 'critical' })

    expect(constructQueue).toHaveBeenCalledWith('critical', { connection: {}, prefix: 'orders:production' })
  })

  it('rejects unsafe or unbounded connection prefixes', async () => {
    const { BullMQConnection } = await import('../../src/runtime/BullMQConnection')

    expect(new BullMQConnection({} as never, { prefix: '{orders:production}' }).prefix).toBe('{orders:production}')
    expect(() => new BullMQConnection({} as never, { prefix: '' })).toThrow('prefix must be a safe identifier')
    expect(() => new BullMQConnection({} as never, { prefix: 'unsafe prefix' })).toThrow('prefix must be a safe identifier')
    expect(() => new BullMQConnection({} as never, { prefix: 'a'.repeat(129) })).toThrow('prefix must be a safe identifier')
    expect(() => new BullMQConnection({} as never, { prefix: 123 as never })).toThrow('prefix must be a safe identifier')
    expect(() => new BullMQConnection({} as never, { prefix: null as never })).toThrow('prefix must be a safe identifier')
  })

  it('accepts an ioredis Cluster client', async () => {
    const { BullMQConnection } = await import('../../src/runtime/BullMQConnection')
    const cluster = {} as import('ioredis').Cluster

    expect(new BullMQConnection(cluster, { prefix: '{orders-production}' }).client).toBe(cluster)
  })

  it('does not treat an empty queue name as every instantiated queue', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await queue.push(new ProbeJob(), { queue: '' })
    await queue.push(new ProbeJob(), { queue: 'reports' })

    await queue.clear('')

    expect(drain).toHaveBeenCalledOnce()
    expect(obliterate).toHaveBeenCalledOnce()
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
