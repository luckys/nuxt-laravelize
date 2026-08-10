import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { fingerprintJobPayload, InMemoryJobRegistry, Job, JobAdmissionMetadataContributorRegistry, JobMetadataContributorRegistry, JobRunner, JobSerializer, readJobDispatchIdentity } from '../../src/runtime'

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
class TaggedCustomPayloadJob extends CustomPayloadJob {
  override tags() { return ['custom:tag'] }
}
class SuperSerializedPayloadJob extends PayloadJob {
  override tags() { return ['custom:tag'] }
  override serialize() { return { ...super.serialize(), payload: { fromSuper: true } } }
}
class ImpostorPayloadJob extends PayloadJob {
  override serialize() { return { version: 1, name: PayloadJob.name, payload: {} } as const }
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

  it('contributes metadata from immutable final admission facts', () => {
    const contributors = new JobMetadataContributorRegistry()
    contributors.contribute(() => ({ ordinary: true }))
    const admissions: unknown[] = []
    const serializer = new JobSerializer(contributors, undefined, () => 'dispatch-1')
    serializer.contributeAdmission('credential', (_job, admission) => {
      admissions.push(admission)
      return { 'delegation.credential': `${admission.queue}:${admission.canonicalJobName}:${admission.dispatch.id}` }
    })
    const registry = new InMemoryJobRegistry()
    registry.register('payload.canonical.v1', TaggedCustomPayloadJob)
    registry.register('custom.payload.v1', TaggedCustomPayloadJob)
    const runner = new JobRunner(createContainer(), registry)

    const serialized = runner.serialize(new TaggedCustomPayloadJob({ ignored: true }), 'critical', serializer)

    const identity = readJobDispatchIdentity(serialized)
    expect(admissions).toEqual([{
      version: 1,
      queue: 'critical',
      serializedJobName: 'custom.payload.v1',
      canonicalJobName: 'payload.canonical.v1',
      dispatch: identity,
    }])
    expect(Object.isFrozen(admissions[0])).toBe(true)
    expect(Object.isFrozen(identity)).toBe(true)
    expect(serialized).toMatchObject({
      name: 'custom.payload.v1',
      payload: { effective: true },
      metadata: {
        'ordinary': true,
        'laravelize.queue.tags.v1': ['custom:tag'],
        'delegation.credential': `critical:payload.canonical.v1:${identity?.id}`,
      },
    })
  })

  it('fails admission metadata closed without trusted final facts', () => {
    const serializer = new JobSerializer()
    serializer.contributeAdmission(() => ({ credential: 'signed' }))
    const runner = new JobRunner(createContainer(), new InMemoryJobRegistry())

    expect(serializer.serialize(new PayloadJob({}))).not.toHaveProperty('metadata.credential')
    expect(() => serializer.serializeForAdmission(new PayloadJob({}), {} as never)).toThrow('Trusted job admission is required')
    expect(() => runner.serialize(new PayloadJob({}), 'unsafe\nqueue', serializer)).toThrow('Invalid job admission queue')
    expect(() => runner.serialize(new PayloadJob({}), 'critical', serializer)).toThrow('Job admission canonical name is not registered')

    const registry = new InMemoryJobRegistry()
    registry.register(PayloadJob.name, PayloadJob)
    expect(() => new JobRunner(createContainer(), registry).serialize(new PayloadJob({}), '', serializer)).not.toThrow()
  })

  it('requires the serialized name to belong to the dispatched constructor', () => {
    const registry = new InMemoryJobRegistry()
    registry.register(PayloadJob.name, PayloadJob)
    const serializer = new JobSerializer()
    serializer.contributeAdmission(() => ({ credential: 'signed' }))

    expect(() => new JobRunner(createContainer(), registry).serialize(new ImpostorPayloadJob({}), 'critical', serializer)).toThrow('canonical name is not registered')
  })

  it('shares protected admission contributors across scoped serializers', () => {
    const admissions = new JobAdmissionMetadataContributorRegistry()
    admissions.contribute('credential', (_job, admission) => ({ credential: admission.dispatch.id }))
    const first = new JobSerializer(undefined, undefined, () => 'dispatch-1', admissions)
    const second = new JobSerializer(undefined, undefined, () => 'dispatch-2', admissions)
    const registry = new InMemoryJobRegistry()
    registry.register(PayloadJob.name, PayloadJob)
    const runner = new JobRunner(createContainer(), registry)

    expect(runner.serialize(new PayloadJob({}), 'critical', first)).toMatchObject({ metadata: { credential: 'dispatch-1' } })
    expect(runner.serialize(new PayloadJob({}), 'critical', second)).toMatchObject({ metadata: { credential: 'dispatch-2' } })
    expect(() => admissions.contributions(new PayloadJob({}), {} as never, undefined, Symbol('forged'))).toThrow('Trusted job admission evaluation is required')
  })

  it('preserves validated tags when custom serialization calls super', () => {
    const contributors = new JobMetadataContributorRegistry()
    contributors.contribute(() => ({ ordinary: true }))

    expect(new JobSerializer(contributors).serialize(new SuperSerializedPayloadJob({}))).toMatchObject({
      payload: { fromSuper: true },
      metadata: { 'ordinary': true, 'laravelize.queue.tags.v1': ['custom:tag'] },
    })
  })

  it('rejects admission metadata collisions and reserved queue keys', () => {
    const registry = new InMemoryJobRegistry()
    registry.register(PayloadJob.name, PayloadJob)
    const runner = new JobRunner(createContainer(), registry)
    const collision = new JobSerializer()
    collision.contribute(() => ({ credential: 'ordinary' }))
    collision.contributeAdmission(() => ({ credential: 'admission' }))
    expect(() => runner.serialize(new PayloadJob({}), 'critical', collision)).toThrow('Duplicate job metadata key')

    const reserved = new JobSerializer()
    reserved.contributeAdmission(() => ({ 'laravelize.queue.dispatch.v1': 'forged' }))
    expect(() => runner.serialize(new PayloadJob({}), 'critical', reserved)).toThrow('Reserved job metadata key')
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
