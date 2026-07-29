import { describe, expect, it, vi } from 'vitest'
import { atomicFixedWindowCacheCapability, InMemoryCache } from '@nuxt-laravelize/cache/runtime'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { Job, JobReleasedError } from '@nuxt-laravelize/queue/runtime'
import { JobOverlapLockLostError, RateLimited, WithoutOverlapping } from '../src/runtime'

class Probe extends Job {
  static executions = 0
  readonly payload = {}
  handle(): void { Probe.executions += 1 }
}

describe('queue middleware', () => {
  it('releases overlapping execution and owner-conditionally unlocks', async () => {
    const cache = new InMemoryCache()
    const middleware = new WithoutOverlapping(cache, { namespace: 'tests', key: 'account:1', releaseAfterMilliseconds: 250, maxReleases: 2, requireDistributed: false })
    let resume: (() => void) | undefined
    const first = middleware.handle(new Probe().serialize(), createContainer(), () => new Promise<void>((resolve) => {
      resume = resolve
    }), { phase: 'process' })
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'))

    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {}, { phase: 'process' })).rejects.toMatchObject({ name: 'JobReleasedError', delay: 250, maxReleases: 2 })
    resume!()
    await first
    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {}, { phase: 'process' })).resolves.toBeUndefined()
  })

  it('rate limits by opaque key and releases until the fixed window resets', async () => {
    let now = 0
    const middleware = new RateLimited(new InMemoryCache(() => now), { namespace: 'tests', key: 'provider:mail', maxAttempts: 1, decaySeconds: 60, requireDistributed: false }, () => now)
    const next = vi.fn().mockResolvedValue(undefined)

    await middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })
    now = 500
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ name: 'JobReleasedError', delay: 59_500 })
    now = 60_000
    await middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })

    expect(next).toHaveBeenCalledTimes(2)
  })

  it('uses the cache clock for release delays', async () => {
    const middleware = new RateLimited(new InMemoryCache(() => 1_000), { namespace: 'tests', key: 'clock-skew', maxAttempts: 1, decaySeconds: 60, requireDistributed: false }, () => 86_400_000)
    const next = vi.fn().mockResolvedValue(undefined)

    await middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ name: 'JobReleasedError', delay: 60_000 })
  })

  it('bypasses failed hooks and fails closed when distributed coordination is required', async () => {
    const cache = new InMemoryCache()
    expect(() => new WithoutOverlapping(cache, { namespace: 'tests', key: 'job:1', requireDistributed: true })).toThrow('distributed owner-atomic cache')
    expect(() => new RateLimited(cache, { namespace: 'tests', key: 'job:1', maxAttempts: 1, requireDistributed: true })).toThrow('distributed owner-atomic cache')
    const nonAtomic = new Proxy(cache, { get: (target, property) => property === atomicFixedWindowCacheCapability ? undefined : Reflect.get(target, property) })
    expect(() => new RateLimited(nonAtomic, { namespace: 'tests', key: 'job:1', maxAttempts: 1, requireDistributed: false })).toThrow('atomic fixed-window cache')
    const next = vi.fn().mockResolvedValue(undefined)
    await new WithoutOverlapping(cache, { namespace: 'tests', key: 'job:1', requireDistributed: false }).handle(new Probe().serialize(), createContainer(), next, { phase: 'failed' })
    await new RateLimited(cache, { namespace: 'tests', key: 'job:1', maxAttempts: 1, requireDistributed: false }).handle(new Probe().serialize(), createContainer(), next, { phase: 'failed' })
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('rejects unsafe keys and release delays', () => {
    const cache = new InMemoryCache()
    expect(() => new WithoutOverlapping(cache, { namespace: 'tests', key: 'contains email@example.com', requireDistributed: false })).toThrow('safe identifier')
    expect(() => new WithoutOverlapping(cache, { namespace: 'tests', key: 'safe', releaseAfterMilliseconds: -1, requireDistributed: false })).toThrow('Release delay')
    expect(() => new JobReleasedError(86_400_001)).toThrow(TypeError)
  })

  it('reports a lost lock after success without replacing job failures', async () => {
    const cache = new InMemoryCache()
    vi.spyOn(cache, 'forgetIf').mockResolvedValue(false)
    const middleware = new WithoutOverlapping(cache, { namespace: 'tests', key: () => 'job:dynamic', requireDistributed: false })

    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {}, { phase: 'process' })).rejects.toBeInstanceOf(JobOverlapLockLostError)

    const failingCache = new InMemoryCache()
    const jobError = new Error('job failed')
    vi.spyOn(failingCache, 'forgetIf').mockRejectedValue(new Error('cache unavailable'))
    const failingMiddleware = new WithoutOverlapping(failingCache, { namespace: 'tests', key: () => 'job:failing', requireDistributed: false })
    await expect(failingMiddleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw jobError
    }, { phase: 'process' })).rejects.toBe(jobError)
  })

  it('validates keys produced at execution time', async () => {
    const cache = new InMemoryCache()
    const middleware = new RateLimited(cache, { namespace: 'tests', key: () => 'unsafe user@example.com', maxAttempts: 1, requireDistributed: false })
    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {}, { phase: 'process' })).rejects.toThrow('safe identifier')
  })

  it('hashes logical keys before cache storage', async () => {
    const cache = new InMemoryCache()
    const add = vi.spyOn(cache, 'add')
    const middleware = new WithoutOverlapping(cache, { namespace: 'app:production', key: 'tenant:secret123:invoice:42', requireDistributed: false })

    await middleware.handle(new Probe().serialize(), createContainer(), async () => {}, { phase: 'process' })

    expect(add.mock.calls[0]?.[0]).toMatch(/^laravelize:lock:queue-overlap:v1:/)
    expect(JSON.stringify(add.mock.calls)).not.toContain('secret123')
  })

  it('detects owner-atomic renewal loss', async () => {
    vi.useFakeTimers()
    const cache = new InMemoryCache()
    vi.spyOn(cache, 'expireIf').mockResolvedValue(false)
    const middleware = new WithoutOverlapping(cache, { namespace: 'tests', key: 'renewal:lost', expiresAfterSeconds: 0.1, renewalIntervalRatio: 0.5, requireDistributed: false })
    let resume: (() => void) | undefined

    try {
      const execution = middleware.handle(new Probe().serialize(), createContainer(), () => new Promise<void>((resolve) => {
        resume = resolve
      }), { phase: 'process' })
      await vi.waitFor(() => expect(resume).toBeTypeOf('function'))
      await vi.advanceTimersByTimeAsync(50)
      resume!()
      await expect(execution).rejects.toBeInstanceOf(JobOverlapLockLostError)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
