/* eslint-disable @stylistic/max-statements-per-line */
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryJobRegistry, Job, JobMetadataContributorRegistry, JobRunner, JobSerializer, queueBatchChildJobId } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { createContainer, createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

const add = vi.fn(async (_name: string, _data: unknown, _options: unknown) => ({ id: 'bull-1' }))
const constructQueue = vi.fn()
const drain = vi.fn()
const obliterate = vi.fn()
const flowAdd = vi.fn(async (flow: { name: string, queueName: string, data: unknown, opts: Record<string, unknown>, children: Array<{ name: string, queueName: string, data: unknown, opts: Record<string, unknown> }> }) => {
  const queueQualifiedName = `bull:${flow.queueName}`
  const parentKey = `${queueQualifiedName}:${flow.opts.jobId}`
  return {
    job: { id: flow.opts.jobId, name: flow.name, data: flow.data, opts: flow.opts, queueQualifiedName },
    children: flow.children.map(child => ({ job: { id: child.opts.jobId, name: child.name, data: child.data, opts: child.opts, queueQualifiedName, parentKey } })),
  }
})
const flowClose = vi.fn()
const getJob = vi.fn()
vi.mock('bullmq', () => ({ FlowProducer: class { add = flowAdd; close = flowClose }, Queue: class {
  add = add
  count = vi.fn()
  drain = drain
  obliterate = obliterate
  close = vi.fn()
  getJob = getJob
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
    flowAdd.mockClear()
    flowClose.mockClear()
    getJob.mockReset()
  })

  it('pushes metadata from the required shared serializer', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const serializer = new JobSerializer()
    serializer.contribute(() => ({ propagated: 'context' }))
    const connection = { client: {} } as never
    const runner = { run: vi.fn() } as unknown as JobRunner
    await new BullMQQueue(connection, runner, serializer).push(new ProbeJob())
    expect(add.mock.calls[0]?.[0]).toBe('ProbeJob')
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      version: 2,
      name: 'ProbeJob',
      payload: { value: 1 },
      metadata: {
        'propagated': 'context',
        'laravelize.queue.tags.v1': ['report:one', 'tenant:trusted'],
        'laravelize.queue.dispatch.v1': { version: 1, id: expect.any(String), payloadFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      },
    })
  })

  it('serializes admission metadata with the actual queue and canonical job', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const contributors = new JobMetadataContributorRegistry()
    const admissions: Array<{ queue: string, canonicalJobName: string }> = []
    const serializer = new JobSerializer(contributors)
    serializer.contributeAdmission((_job, admission) => {
      admissions.push(admission)
      return { credential: admission.dispatch.id }
    })
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    vi.spyOn(runner, 'run').mockResolvedValue(undefined)
    const queue = new BullMQQueue({ client: {} } as never, runner, serializer)

    await queue.push(new ProbeJob(), { queue: 'critical' })
    await queue.sync(new ProbeJob())

    expect(admissions).toEqual([
      expect.objectContaining({ queue: 'critical', canonicalJobName: ProbeJob.name }),
      expect.objectContaining({ queue: 'default', canonicalJobName: ProbeJob.name }),
    ])
    expect(runner.run).toHaveBeenCalledWith(expect.any(Object), { queue: 'default' })
  })

  it('eagerly prepares a linear chain and admits only its first step', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const admissions: string[] = []
    const serializer = new JobSerializer()
    serializer.contributeAdmission((_job, admission) => {
      admissions.push(admission.queue)
      return { credential: admission.dispatch.id }
    })
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    const queue = new BullMQQueue({ client: {} } as never, runner, serializer)

    const handle = await queue.chain([
      { job: new ProbeJob(), options: { queue: 'critical', tries: 2 } },
      { job: new ProbeJob(), options: { queue: 'reports', delay: 100 } },
    ])

    expect(handle.queue).toBe('critical')
    expect(admissions).toEqual(['critical', 'reports'])
    expect(add).toHaveBeenCalledOnce()
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      kind: 'nuxt-laravelize.queue-chain',
      version: 1,
      index: 0,
      steps: [
        { options: { queue: 'critical', tries: 2 } },
        { options: { queue: 'reports', delay: 100 } },
      ],
    })
    expect(add.mock.calls[0]?.[2]).toMatchObject({ attempts: 2, jobId: expect.stringMatching(/^laravelize-chain-/) })
  })

  it('atomically admits one flat same-queue flow with a hidden retained coordinator', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const registry = new InMemoryJobRegistry(); registry.register(ProbeJob.name, ProbeJob)
    const serializer = new JobSerializer(); const admissions: string[] = []
    serializer.contributeAdmission((_job, admission) => { admissions.push(admission.dispatch.id); return {} })
    const queue = new BullMQQueue({ client: {} } as never, new JobRunner(createContainer(), registry), serializer)

    const handle = await queue.batch([{ job: new ProbeJob(), options: { tries: 2 } }, { job: new ProbeJob(), options: { delay: 10 } }], { queue: 'critical' })

    expect(handle).toMatchObject({ queue: 'critical', id: expect.any(String) })
    expect(new Set(admissions).size).toBe(2)
    expect(flowAdd).toHaveBeenCalledOnce()
    expect(flowAdd.mock.calls[0]?.[0]).toMatchObject({
      queueName: 'critical',
      name: '__nuxt_laravelize_batch_coordinator__',
      opts: { removeOnComplete: { age: 86_400, count: 1000 }, removeOnFail: { age: 86_400, count: 1000 } },
      children: [
        { queueName: 'critical', opts: { attempts: 2, ignoreDependencyOnFailure: true, removeOnComplete: { age: 86_400, count: 1000 }, removeOnFail: { age: 604_800, count: 1000 } } },
        { queueName: 'critical', opts: { delay: 10, ignoreDependencyOnFailure: true, removeOnComplete: { age: 86_400, count: 1000 }, removeOnFail: { age: 604_800, count: 1000 } } },
      ],
    })
    await queue.close()
    expect(flowClose).toHaveBeenCalledOnce()
  })

  it('derives bounded durable progress from retained coordinator dependencies and marks cancellation idempotently', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const registry = new InMemoryJobRegistry(); registry.register(ProbeJob.name, ProbeJob)
    const queue = new BullMQQueue({ client: {} } as never, new JobRunner(createContainer(), registry), new JobSerializer())
    const handle = await queue.batch([{ job: new ProbeJob() }, { job: new ProbeJob() }, { job: new ProbeJob() }], { queue: 'critical' })
    const definition = flowAdd.mock.calls[0]![0] as unknown as { data: Record<string, unknown>, name: string, opts: { jobId: string } }
    const updateData = vi.fn(async (data) => { definition.data = data })
    const queueQualifiedName = 'bull:critical'
    const keys = Array.from({ length: 3 }, (_, index) => `${queueQualifiedName}:${queueBatchChildJobId(handle.id, index)}`)
    const getDependencies = vi.fn(async () => ({ processed: { [keys[0]!]: { status: 'succeeded' }, [keys[1]!]: JSON.stringify({ status: 'cancelled' }) }, ignored: { [keys[2]!]: 'failed' }, unprocessed: [] }))
    getJob.mockImplementation(async () => ({ id: definition.opts.jobId, name: definition.name, queueQualifiedName, get data() { return definition.data }, getDependencies, updateData }))
    expect(await queue.batchStatus(handle)).toEqual({ total: 3, pending: 0, succeeded: 1, failed: 1, cancelled: 1, cancellationRequested: false, state: 'cancelled' })
    expect(getDependencies).toHaveBeenCalledWith()
    expect(await queue.cancelBatch(handle)).toMatchObject({ cancellationRequested: true, state: 'cancelled' })
    await queue.cancelBatch(handle)
    expect(updateData).toHaveBeenCalledOnce()
  })

  it('fails closed for malformed processed results and forged handles before constructing a queue', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const registry = new InMemoryJobRegistry(); registry.register(ProbeJob.name, ProbeJob)
    const queue = new BullMQQueue({ client: {} } as never, new JobRunner(createContainer(), registry), new JobSerializer())
    const handle = await queue.batch([{ job: new ProbeJob() }])
    const definition = flowAdd.mock.calls[0]![0] as unknown as { data: Record<string, unknown>, name: string, opts: { jobId: string } }
    const queueQualifiedName = 'bull:default'
    const key = `${queueQualifiedName}:${queueBatchChildJobId(handle.id, 0)}`
    getJob.mockResolvedValue({ id: definition.opts.jobId, name: definition.name, queueQualifiedName, data: definition.data, getDependencies: vi.fn(async () => ({ processed: { [key]: 'malformed' } })) })
    await expect(queue.batchStatus(handle)).rejects.toThrow('processed result')
    constructQueue.mockClear()
    await expect(queue.batchStatus({ id: 'unsafe:id', queue: 'attacker' })).rejects.toThrow('Invalid queue batch handle')
    expect(constructQueue).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', { processed: {}, ignored: {}, unprocessed: [] }],
    ['unexpected', { processed: {}, ignored: {}, unprocessed: ['bull:default:unexpected'] }],
    ['duplicate', null],
    ['overlapping', null],
    ['failed category', null],
  ])('rejects %s retained batch dependency keys', async (variant, supplied) => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const registry = new InMemoryJobRegistry(); registry.register(ProbeJob.name, ProbeJob)
    const queue = new BullMQQueue({ client: {} } as never, new JobRunner(createContainer(), registry), new JobSerializer())
    const handle = await queue.batch([{ job: new ProbeJob() }])
    const definition = flowAdd.mock.calls[0]![0] as unknown as { data: Record<string, unknown>, name: string, opts: { jobId: string } }
    const queueQualifiedName = 'bull:default'
    const key = `${queueQualifiedName}:${queueBatchChildJobId(handle.id, 0)}`
    const dependencies = supplied ?? (variant === 'overlapping'
      ? { processed: { [key]: { status: 'succeeded' } }, ignored: {}, unprocessed: [key] }
      : variant === 'duplicate'
        ? { processed: {}, ignored: {}, unprocessed: [key, key] }
        : { processed: {}, ignored: {}, unprocessed: [key], failed: ['bull:default:failed-child'] })
    getJob.mockResolvedValue({ id: definition.opts.jobId, name: definition.name, queueQualifiedName, data: definition.data, getDependencies: vi.fn(async () => dependencies) })
    await expect(queue.batchStatus(handle)).rejects.toThrow('Invalid BullMQ queue batch')
  })

  it('fails admission verification when FlowProducer returns altered transport state', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const registry = new InMemoryJobRegistry(); registry.register(ProbeJob.name, ProbeJob)
    flowAdd.mockResolvedValueOnce({ job: { id: 'wrong', name: 'wrong' }, children: [] } as never)
    const queue = new BullMQQueue({ client: {} } as never, new JobRunner(createContainer(), registry), new JobSerializer())
    await expect(queue.batch([{ job: new ProbeJob() }])).rejects.toThrow('transport identity mismatch')
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
    await expect(queue.push(new ProbeJob(), { id: 'laravelize-chain-injected-1' })).rejects.toThrow('reserved queue chain prefix')
    await expect(queue.push(new ProbeJob(), { id: 'laravelize-batch-injected-1' })).rejects.toThrow('reserved queue batch prefix')
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
