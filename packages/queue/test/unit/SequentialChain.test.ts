import { describe, expect, it } from 'vitest'
import { Job, JobSerializer, MAX_QUEUE_CHAIN_STEPS, nextQueueChainEnvelope, prepareQueueChain, readQueueChainEnvelope } from '../../src/runtime'

class ChainJob extends Job<{ value: unknown }> {
  readonly payload: { value: unknown }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { value: unknown }
  }

  handle() {}
}

const bundledJobBrand = Symbol.for('@luckys_luis/nuxt-laravelize-queue/job')
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

const prepare = (values: readonly unknown[]) => prepareQueueChain(
  values.map(value => ({ job: new ChainJob({ value }) })),
  new JobSerializer(),
  (job, _queue, serializer) => serializer.serialize(job),
  () => 'test-chain',
)

describe('sequential chain envelopes', () => {
  it('keeps every bounded index valid, including multi-digit transitions', () => {
    let chain = prepare(Array.from({ length: MAX_QUEUE_CHAIN_STEPS }, (_, index) => index))

    for (let index = 0; index < MAX_QUEUE_CHAIN_STEPS; index++) {
      expect(readQueueChainEnvelope(JSON.parse(JSON.stringify(chain)))).toMatchObject({ index })
      chain = nextQueueChainEnvelope(chain) ?? chain
    }

    expect(chain.index).toBe(MAX_QUEUE_CHAIN_STEPS - 1)
  })

  it('detects changes to order, index or prepared job data', () => {
    const chain = prepare([1, 2])

    expect(() => readQueueChainEnvelope({ ...chain, index: 1 })).toThrow('Invalid queue chain envelope')
    const changed = structuredClone(chain)
    ;(changed.steps[1]!.serialized.payload as { value: number }).value = 3
    expect(() => readQueueChainEnvelope(changed)).toThrow('Invalid queue chain envelope')
  })

  it('rejects oversized or overly complex chains before admission', () => {
    expect(() => prepare(['x'.repeat(246_000)])).toThrow('Queue chain envelope is too large')
    expect(() => prepare([Array.from({ length: 8_000 }, (_, index) => index)])).toThrow('Queue chain envelope is too complex')
  })

  it('stops serializing steps when the cumulative envelope exceeds its bound', () => {
    const serializer = new JobSerializer()
    let serializations = 0

    expect(() => prepareQueueChain([
      { job: new ChainJob({ value: 'x'.repeat(246_000) }) },
      { job: new ChainJob({ value: 'unreachable' }) },
    ], serializer, (job, _queue, currentSerializer) => {
      serializations += 1
      return currentSerializer.serialize(job)
    }, () => 'test-chain')).toThrow('Queue chain envelope is too large')

    expect(serializations).toBe(1)
  })

  it('accepts jobs created by a duplicated bundled runtime', () => {
    const chain = prepareQueueChain(
      [{ job: new ForeignBundledJob() as unknown as Job }],
      new JobSerializer(),
      (job, _queue, serializer) => serializer.serialize(job),
      () => 'foreign-chain',
    )

    expect(chain.steps[0]?.serialized.name).toBe('foreign-bundled-job')
  })
})
