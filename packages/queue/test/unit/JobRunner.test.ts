/* eslint-disable @stylistic/max-statements-per-line, @typescript-eslint/no-useless-constructor */
import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, JOB_TAGS_METADATA_KEY, Job, JobMetadataContributorRegistry, JobReleasedError, JobRunner, JobSerializer, MAX_JOB_METADATA_KEYS, MAX_JOB_TAGS, isJobReleasedError, readJobTags } from '../../src/runtime/index'

class Probe extends Job { readonly payload = {}; constructor() { super() } handle() {} }
class TaggedProbe extends Probe { constructor(private readonly values: readonly string[]) { super() } override tags() { return this.values } }
class CustomSerializedProbe extends Probe {
  override serialize() { return { version: 1, name: 'custom.probe', payload: { custom: true } } as const }
}
describe('JobRunner middleware', () => {
  it('uses stable order and rejects duplicate ids', async () => {
    const registry = new InMemoryJobRegistry(); registry.register(Probe.name, Probe); const runner = new JobRunner(createContainer(), registry); const calls: string[] = []
    runner.use('late', async (_job, _scope, next) => { calls.push('late:before'); await next(); calls.push('late:after') }, 10)
    runner.use('early', async (_job, _scope, next) => { calls.push('early:before'); await next(); calls.push('early:after') }, -10)
    expect(() => runner.use('late', async () => {})).toThrow(TypeError)
    await runner.run(new Probe().serialize(), { queue: 'critical', attempt: 2, maxAttempts: 3 })
    expect(calls).toEqual(['early:before', 'late:before', 'late:after', 'early:after'])
  })
  it('rejects colliding metadata keys while allowing distinct contributors', () => {
    const contributors = new JobMetadataContributorRegistry()
    contributors.contribute(() => ({ first: 1 })); contributors.contribute(() => ({ second: 2 }))
    expect(new JobSerializer(contributors).serialize(new Probe())).toMatchObject({ metadata: { first: 1, second: 2 } })
    contributors.contribute(() => ({ first: 3 }))
    expect(() => new JobSerializer(contributors).serialize(new Probe())).toThrow('Duplicate job metadata key')
  })
  it('detaches nested metadata from contributor mutations', () => {
    const nested = { value: 'original' }
    const contributors = new JobMetadataContributorRegistry(); contributors.contribute(() => ({ nested }))
    const serialized = new JobSerializer(contributors).serialize(new Probe())
    nested.value = 'mutated'
    expect(serialized).toMatchObject({ metadata: { nested: { value: 'original' } } })
  })
  it('rejects prototype-mutating metadata keys and always emits own plain metadata', () => {
    for (const key of ['__proto__', 'prototype', 'constructor']) {
      const contributors = new JobMetadataContributorRegistry()
      contributors.contribute(() => Object.defineProperty({}, key, { enumerable: true, value: 'unsafe' }))
      expect(() => new JobSerializer(contributors).serialize(new Probe())).toThrow('Reserved job metadata key')
    }
    const contributors = new JobMetadataContributorRegistry(); contributors.contribute(() => ({ safe: true }))
    const serialized = new JobSerializer(contributors).serialize(new Probe())
    expect(serialized.version).toBe(2)
    if (serialized.version === 2) { expect(Object.getPrototypeOf(serialized.metadata)).toBe(Object.prototype); expect(Object.hasOwn(serialized.metadata, 'safe')).toBe(true) }
  })
  it('rejects malformed v2 envelopes before middleware', async () => {
    const runner = new JobRunner(createContainer(), new InMemoryJobRegistry()); const middleware = vi.fn()
    runner.use(async () => { middleware() })
    await expect(runner.run({ version: 2, name: 'Probe', payload: {}, metadata: null } as never)).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    expect(middleware).not.toHaveBeenCalled()
  })
  it('serializes bounded tags once alongside contributor metadata', () => {
    const declared = ['report:one', 'tenant:trusted', 'report:one']
    const contributors = new JobMetadataContributorRegistry(); contributors.contribute(() => ({ propagated: true }))
    const serialized = new JobSerializer(contributors).serialize(new TaggedProbe(declared))
    declared[0] = 'mutated'
    expect(serialized).toMatchObject({ version: 2, metadata: { propagated: true, [JOB_TAGS_METADATA_KEY]: ['report:one', 'tenant:trusted'] } })
    expect(readJobTags(serialized)).toEqual(['report:one', 'tenant:trusted'])
    expect(Object.isFrozen(readJobTags(serialized))).toBe(true)
  })
  it('uses the same tag-aware envelope for direct and shared serialization', () => {
    const tagged = new TaggedProbe(['report:direct'])
    const tags = vi.spyOn(tagged, 'tags')
    expect(tagged.serialize()).toMatchObject({ version: 2, metadata: { [JOB_TAGS_METADATA_KEY]: ['report:direct'] } })
    expect(tags).toHaveBeenCalledOnce()
    expect(new Probe().serialize()).toEqual({ version: 1, name: 'Probe', payload: {} })
    expect(() => new TaggedProbe(['unsafe value']).serialize()).toThrow('Job tags must be safe identifiers')
  })
  it('adds dispatch identity to the effective custom serialization', () => {
    const custom = new CustomSerializedProbe()
    expect(custom.serialize()).toEqual({ version: 1, name: 'custom.probe', payload: { custom: true } })
    expect(new JobSerializer().serialize(custom)).toMatchObject({ version: 2, name: 'custom.probe', payload: { custom: true }, metadata: { 'laravelize.queue.dispatch.v1': { version: 1 } } })
    const contributors = new JobMetadataContributorRegistry(); contributors.contribute(() => ({}))
    expect(new JobSerializer(contributors).serialize(custom)).toMatchObject({ version: 2, name: 'custom.probe', payload: { custom: true } })
  })
  it('reserves tag metadata ownership and validates bounded identifiers', () => {
    const contributors = new JobMetadataContributorRegistry(); contributors.contribute(() => ({ [JOB_TAGS_METADATA_KEY]: ['spoofed'] }))
    expect(() => new JobSerializer(contributors).serialize(new Probe())).toThrow('Reserved job metadata key')
    for (const tags of [[''], ['unsafe value'], ['a'.repeat(129)], Array.from({ length: MAX_JOB_TAGS + 1 }, () => 'valid'), ['valid', 1] as never]) {
      expect(() => new JobSerializer().serialize(new TaggedProbe(tags))).toThrow(TypeError)
    }
  })
  it('enforces tag and metadata boundaries on the final envelope', () => {
    const maximumTag = `a${'x'.repeat(127)}`
    const maximumAggregate = Array.from({ length: 8 }, (_, index) => `${index}${'x'.repeat(127)}`)
    expect(readJobTags(new TaggedProbe(Array.from({ length: MAX_JOB_TAGS }, (_, index) => `tag:${index}`)).serialize())).toHaveLength(MAX_JOB_TAGS)
    expect(readJobTags(new TaggedProbe([maximumTag]).serialize())).toEqual([maximumTag])
    expect(readJobTags(new TaggedProbe(maximumAggregate).serialize())).toEqual(maximumAggregate)
    expect(() => new TaggedProbe([...maximumAggregate, 'a']).serialize()).toThrow('at most 1024 characters in total')

    const contributors = new JobMetadataContributorRegistry()
    contributors.contribute(() => Object.fromEntries(Array.from({ length: MAX_JOB_METADATA_KEYS - 1 }, (_, index) => [`key-${index}`, index])))
    expect(new JobSerializer(contributors).serialize(new Probe())).toMatchObject({ version: 2 })
    expect(new JobSerializer(contributors).serialize(new TaggedProbe(['report:tagged']))).toMatchObject({ version: 2 })
    contributors.contribute(() => ({ overflow: true }))
    expect(new JobSerializer(contributors).serialize(new Probe())).toMatchObject({ version: 2 })
    expect(() => new JobSerializer(contributors).serialize(new TaggedProbe(['report:tagged']))).toThrow('at most 64 keys')
  })
  it('defensively ignores absent or malformed persisted tag metadata', () => {
    expect(readJobTags(new Probe().serialize())).toEqual([])
    for (const value of [null, 'tag', ['unsafe value'], Array.from({ length: MAX_JOB_TAGS + 1 }, () => 'valid')]) {
      expect(readJobTags({ version: 2, name: 'Probe', payload: {}, metadata: { [JOB_TAGS_METADATA_KEY]: value } })).toEqual([])
    }
    const throwing = new Proxy({}, { getPrototypeOf() { throw new Error('trap') } })
    expect(readJobTags({ version: 2, name: 'Probe', payload: {}, metadata: throwing })).toEqual([])
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, JOB_TAGS_METADATA_KEY)
    Object.defineProperty(Object.prototype, JOB_TAGS_METADATA_KEY, { configurable: true, value: ['inherited'] })
    try {
      expect(readJobTags({ version: 2, name: 'Probe', payload: {}, metadata: {} })).toEqual([])
    }
    finally {
      if (previous) Object.defineProperty(Object.prototype, JOB_TAGS_METADATA_KEY, previous)
      else Reflect.deleteProperty(Object.prototype, JOB_TAGS_METADATA_KEY)
    }
  })
  it('validates portable release signals', () => {
    expect(isJobReleasedError(new JobReleasedError(1000))).toBe(true)
    expect(isJobReleasedError({ name: 'JobReleasedError', delay: 1000 })).toBe(false)
    expect(() => new JobReleasedError(0)).toThrow(TypeError)
    expect(() => new JobReleasedError(86_400_001)).toThrow(TypeError)
    expect(() => new JobReleasedError(1, 100_001)).toThrow(TypeError)
  })
})
