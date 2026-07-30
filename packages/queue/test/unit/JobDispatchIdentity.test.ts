import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { fingerprintJobPayload, InMemoryJobRegistry, Job, JobRunner, JobSerializer, readJobDispatchIdentity } from '../../src/runtime'

class PayloadJob extends Job<Record<string, unknown>> {
  readonly payload: Record<string, unknown>
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload
  }

  handle() {}
}

class CustomPayloadJob extends PayloadJob {
  override serialize() { return { version: 1, name: 'custom.payload.v1', payload: { effective: true } } as const }
}

describe('job dispatch identity', () => {
  it('creates a unique dispatch id and stable canonical payload fingerprint', () => {
    const ids = ['dispatch-1', 'dispatch-2']
    const serializer = new JobSerializer(undefined, undefined, () => ids.shift()!)

    const first = serializer.serialize(new PayloadJob({ second: [2, 1], first: { value: true } }))
    const second = serializer.serialize(new PayloadJob({ first: { value: true }, second: [2, 1] }))

    expect(readJobDispatchIdentity(first)).toEqual({ version: 1, id: 'dispatch-1', payloadFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) })
    expect(readJobDispatchIdentity(second)).toEqual({ version: 1, id: 'dispatch-2', payloadFingerprint: readJobDispatchIdentity(first)?.payloadFingerprint })
    expect(fingerprintJobPayload({ values: [1, 2] })).not.toBe(fingerprintJobPayload({ values: [2, 1] }))
  })

  it('snapshots the effective serialized payload before hashing', () => {
    const payload = { nested: { value: 'original' } }
    const serialized = new JobSerializer(undefined, undefined, () => 'dispatch-1').serialize(new PayloadJob(payload))
    payload.nested.value = 'mutated'

    expect(serialized.payload).toEqual({ nested: { value: 'original' } })

    const custom = new JobSerializer(undefined, undefined, () => 'dispatch-2').serialize(new CustomPayloadJob({ ignored: true }))
    expect(custom).toMatchObject({ name: 'custom.payload.v1', payload: { effective: true } })
    expect(readJobDispatchIdentity(custom)?.payloadFingerprint).toBe(fingerprintJobPayload({ effective: true }))
  })

  it('rejects values that transports cannot preserve consistently', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => 'unsafe' })
    const sparse = Array(1)
    const invalid = [
      { value: undefined }, { value: Number.NaN }, { value: Number.POSITIVE_INFINITY }, { value: 1n },
      { value: new Date() }, { value: accessor }, { value: sparse }, cyclic, null, [],
    ]

    for (const payload of invalid) expect(() => new JobSerializer().serialize(new PayloadJob(payload as never))).toThrow('Invalid job payload')
    expect(() => new JobSerializer().serialize(new PayloadJob({ value: 'x'.repeat(1_048_576) }))).toThrow('Invalid job payload')
    expect(() => new JobSerializer().serialize(new PayloadJob(Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`key-${index}`, index]))))).toThrow('Invalid job payload')
  })

  it('rejects malformed or mismatched dispatch identity before middleware', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(PayloadJob.name, PayloadJob)
    const runner = new JobRunner(createContainer(), registry)
    const middleware = vi.fn()
    runner.use(async () => {
      middleware()
    })
    const serialized = new JobSerializer(undefined, undefined, () => 'dispatch-1').serialize(new PayloadJob({ value: 'original' }))
    if (serialized.version !== 2) throw new Error('Expected dispatch metadata')

    await expect(runner.run({ ...serialized, payload: { value: 'tampered' } })).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    await expect(runner.run({ ...serialized, metadata: { ...serialized.metadata, 'laravelize.queue.dispatch.v1': null } } as never)).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    await expect(runner.run({ ...serialized, payload: [] } as never)).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    await expect(runner.run({ ...serialized, metadata: null } as never)).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    await expect(runner.run({ version: 1, name: PayloadJob.name, payload: { nested: new Date() } } as never)).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    expect(middleware).not.toHaveBeenCalled()
  })

  it('continues to execute legacy envelopes without dispatch metadata', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(PayloadJob.name, PayloadJob)
    await expect(new JobRunner(createContainer(), registry).run(new PayloadJob({ legacy: true }).serialize())).resolves.toBeUndefined()
  })
})
