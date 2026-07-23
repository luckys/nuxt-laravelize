/* eslint-disable @stylistic/max-statements-per-line, @typescript-eslint/no-useless-constructor */
import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, Job, JobMetadataContributorRegistry, JobRunner, JobSerializer } from '../../src/runtime/index'

class Probe extends Job { readonly payload = {}; constructor() { super() } handle() {} }
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
    await expect(runner.run({ version: 2, name: 'Probe', payload: {}, metadata: null } as never)).rejects.toThrow('Invalid serialized job envelope')
    expect(middleware).not.toHaveBeenCalled()
  })
})
