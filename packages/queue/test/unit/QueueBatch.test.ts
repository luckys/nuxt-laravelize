/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it } from 'vitest'
import { Job, JobSerializer, MAX_QUEUE_BATCH_ITEMS, prepareQueueBatch, queueBatchSnapshot, readJobDispatchIdentity, readQueueBatchChildEnvelope, readQueueBatchCoordinatorEnvelope } from '../../src/runtime'

class BatchJob extends Job<{ value: unknown }> {
  readonly payload: { value: unknown }
  constructor(payload: Record<string, unknown>) { super(); this.payload = payload as { value: unknown } }
  handle() {}
}

const bundledJobBrand = Symbol.for('@nuxt-laravelize/queue/job')
class ForeignBundledJob {
  static readonly jobName = 'foreign-bundled-job'
  static readonly tries = 1
  static readonly delay = 0
  static readonly queue = 'default'
  static readonly backoff = 0
  static readonly priority = 0
  readonly [bundledJobBrand] = true
  readonly payload = { value: 'foreign' }
  handle() {}
  tags() { return [] }
  serialize() { return { version: 1 as const, name: ForeignBundledJob.jobName, payload: this.payload } }
}

const prepare = (values: readonly unknown[]) => prepareQueueBatch(
  values.map(value => ({ job: new BatchJob({ value }) })),
  {},
  new JobSerializer(),
  (job, _queue, serializer) => serializer.serialize(job),
  () => 'test-batch',
)

describe('QueueBatch', () => {
  it('prepares bounded same-queue children with integrity and deterministic transport ids', () => {
    const batch = prepare([1, 2])
    expect(batch.handle).toEqual({ id: 'test-batch', queue: 'default' })
    expect(new Set(batch.children.map(child => readJobDispatchIdentity(child.serialized)?.id)).size).toBe(2)
    expect(batch.children.map(child => readQueueBatchChildEnvelope(JSON.parse(JSON.stringify(child)))?.index)).toEqual([0, 1])
    expect(readQueueBatchCoordinatorEnvelope(JSON.parse(JSON.stringify(batch.coordinator)))).toMatchObject({ total: 2, cancellationRequested: false })
  })

  it('rejects invalid inputs and cumulative bounds before admission completes', () => {
    expect(() => prepare([])).toThrow('at least 1 item')
    expect(() => prepare(Array.from({ length: MAX_QUEUE_BATCH_ITEMS + 1 }, (_, index) => index))).toThrow(`at most ${MAX_QUEUE_BATCH_ITEMS} items`)
    expect(() => prepareQueueBatch([{ job: new BatchJob({ value: 1 }), options: { queue: 'other' } as never }], {}, new JobSerializer(), (job, _queue, serializer) => serializer.serialize(job))).toThrow('item options')
    expect(() => prepare(['x'.repeat(246_000)])).toThrow('too large')
  })

  it('fails closed for tampered child and coordinator wrappers', () => {
    const batch = prepare([1])
    expect(() => readQueueBatchChildEnvelope({ ...batch.children[0], index: 1 })).toThrow('Invalid queue batch child envelope')
    expect(() => readQueueBatchCoordinatorEnvelope({ ...batch.coordinator, cancellationRequested: true })).toThrow('Invalid queue batch coordinator envelope')
  })

  it('enforces bounded exact snapshot counters', () => {
    expect(() => queueBatchSnapshot(0, 0, 0, 0, false)).toThrow('Invalid queue batch counters')
    expect(() => queueBatchSnapshot(101, 0, 0, 0, false)).toThrow('Invalid queue batch counters')
    expect(() => queueBatchSnapshot(1, 1, 1, 0, false)).toThrow('Invalid queue batch counters')
  })

  it('accepts jobs created by a duplicated bundled runtime', () => {
    const batch = prepareQueueBatch(
      [{ job: new ForeignBundledJob() as unknown as Job }],
      {},
      new JobSerializer(),
      (job, _queue, serializer) => serializer.serialize(job),
      () => 'foreign-batch',
    )

    expect(batch.children[0]?.serialized.name).toBe('foreign-bundled-job')
  })
})
