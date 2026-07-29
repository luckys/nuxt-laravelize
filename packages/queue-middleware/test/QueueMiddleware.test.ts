import { describe, expect, it, vi } from 'vitest'
import { atomicFixedWindowCacheCapability, InMemoryCache } from '@nuxt-laravelize/cache/runtime'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { Job, JobReleasedError, NonRetryableJobError } from '@nuxt-laravelize/queue/runtime'
import { ExceptionThrottleOpenError, ExceptionThrottlePredicateError, ExceptionThrottleRecordingError, JobOverlapLockLostError, RateLimited, ThrottlesExceptions, WithoutOverlapping } from '../src/runtime'

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

  it('throttles an atomic fixed-window exception budget', async () => {
    let now = 0
    const cache = new InMemoryCache(() => now)
    const middleware = new ThrottlesExceptions(cache, { namespace: 'tests', key: 'provider:mail', maxExceptions: 2, decaySeconds: 60, backoffMilliseconds: 250, maxReleases: 10, requireDistributed: false, when: () => true })
    const failure = new Error('provider failed')
    const next = vi.fn().mockRejectedValue(failure)

    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ name: 'JobReleasedError', delay: 250, maxReleases: 10 })
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ name: 'JobReleasedError', delay: 60_000, maxReleases: 10 })
    now = 500
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ name: 'JobReleasedError', delay: 59_500 })
    expect(next).toHaveBeenCalledTimes(2)

    now = 60_000
    next.mockRejectedValueOnce(new Error('fresh window'))
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ delay: 250 })
  })

  it('does not clear recorded exceptions after a successful execution', async () => {
    const cache = new InMemoryCache(() => 0)
    const middleware = new ThrottlesExceptions(cache, { namespace: 'tests', key: 'provider:storage', maxExceptions: 2, decaySeconds: 60, requireDistributed: false, when: () => true })
    const next = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('second'))

    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ delay: 1000 })
    await middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ delay: 60_000 })
  })

  it('records concurrent eligible failures atomically and blocks the next execution', async () => {
    const cache = new InMemoryCache(() => 0)
    const middleware = new ThrottlesExceptions(cache, { namespace: 'tests', key: 'provider:concurrent', maxExceptions: 2, decaySeconds: 60, backoffMilliseconds: 250, requireDistributed: false, when: async () => true })
    const next = vi.fn(async () => {
      throw new Error('provider')
    })

    const results = await Promise.allSettled([
      middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' }),
      middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' }),
    ])
    const delays = results.map(result => result.status === 'rejected' ? result.reason.delay : undefined).sort((left, right) => left - right)
    expect(delays).toEqual([250, 60_000])
    await expect(middleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toMatchObject({ delay: 60_000, cause: expect.any(ExceptionThrottleOpenError) })
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('fails closed by counting predicate failures while preserving both causes', async () => {
    const cache = new InMemoryCache(() => 0)
    const jobError = new Error('provider')
    const predicateError = new Error('classification failed')
    const middleware = new ThrottlesExceptions(cache, { namespace: 'tests', key: 'provider:predicate', maxExceptions: 1, decaySeconds: 60, requireDistributed: false, when: async () => {
      throw predicateError
    } })

    const released = await middleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw jobError
    }, { phase: 'process' }).catch(error => error)
    expect(released).toMatchObject({ name: 'JobReleasedError', delay: 60_000, cause: expect.any(ExceptionThrottlePredicateError) })
    expect((released.cause.cause as AggregateError).errors).toEqual([jobError, predicateError])
  })

  it('does not count release signals, terminal failures, excluded errors, or failed hooks', async () => {
    const cache = new InMemoryCache()
    const hit = vi.spyOn(cache, 'hitFixedWindow')
    const excluded = new Error('excluded')
    const middleware = new ThrottlesExceptions(cache, { namespace: 'tests', key: 'provider:api', maxExceptions: 1, requireDistributed: false, when: error => error !== excluded })
    const release = new JobReleasedError(100)
    const terminal = new NonRetryableJobError('INVALID_REQUEST', 'terminal')

    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw release
    }, { phase: 'process' })).rejects.toBe(release)
    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw terminal
    }, { phase: 'process' })).rejects.toBe(terminal)
    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw excluded
    }, { phase: 'process' })).rejects.toBe(excluded)
    const failed = vi.fn().mockResolvedValue(undefined)
    await middleware.handle(new Probe().serialize(), createContainer(), failed, { phase: 'failed' })

    expect(hit).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
  })

  it('fails closed and preserves both errors when exception recording fails', async () => {
    const cache = new InMemoryCache()
    const jobError = new Error('job failed')
    const cacheError = new Error('cache unavailable')
    vi.spyOn(cache, 'hitFixedWindow').mockRejectedValue(cacheError)
    const middleware = new ThrottlesExceptions(cache, { namespace: 'tests', key: 'provider:billing', maxExceptions: 1, requireDistributed: false, when: () => true })

    const failure = await middleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw jobError
    }, { phase: 'process' }).catch(error => error)
    expect(failure).toBeInstanceOf(ExceptionThrottleRecordingError)
    expect(failure.cause).toBeInstanceOf(AggregateError)
    expect((failure.cause as AggregateError).errors).toEqual([jobError, cacheError])

    const blocked = new InMemoryCache()
    const readError = new Error('cache read unavailable')
    vi.spyOn(blocked, 'fixedWindowState').mockRejectedValue(readError)
    const next = vi.fn()
    const blockedMiddleware = new ThrottlesExceptions(blocked, { namespace: 'tests', key: 'provider:billing', maxExceptions: 1, requireDistributed: false, when: () => true })
    await expect(blockedMiddleware.handle(new Probe().serialize(), createContainer(), next, { phase: 'process' })).rejects.toBe(readError)
    expect(next).not.toHaveBeenCalled()
  })

  it('bypasses failed hooks and fails closed when distributed coordination is required', async () => {
    const cache = new InMemoryCache()
    expect(() => new WithoutOverlapping(cache, { namespace: 'tests', key: 'job:1', requireDistributed: true })).toThrow('distributed owner-atomic cache')
    expect(() => new RateLimited(cache, { namespace: 'tests', key: 'job:1', maxAttempts: 1, requireDistributed: true })).toThrow('distributed owner-atomic cache')
    expect(() => new ThrottlesExceptions(cache, { namespace: 'tests', key: 'job:1', maxExceptions: 1, requireDistributed: true, when: () => true })).toThrow('distributed owner-atomic cache')
    const nonAtomic = new Proxy(cache, { get: (target, property) => property === atomicFixedWindowCacheCapability ? undefined : Reflect.get(target, property) })
    expect(() => new RateLimited(nonAtomic, { namespace: 'tests', key: 'job:1', maxAttempts: 1, requireDistributed: false })).toThrow('atomic fixed-window cache')
    expect(() => new ThrottlesExceptions(nonAtomic, { namespace: 'tests', key: 'job:1', maxExceptions: 1, requireDistributed: false, when: () => true })).toThrow('atomic fixed-window cache')
    const next = vi.fn().mockResolvedValue(undefined)
    await new WithoutOverlapping(cache, { namespace: 'tests', key: 'job:1', requireDistributed: false }).handle(new Probe().serialize(), createContainer(), next, { phase: 'failed' })
    await new RateLimited(cache, { namespace: 'tests', key: 'job:1', maxAttempts: 1, requireDistributed: false }).handle(new Probe().serialize(), createContainer(), next, { phase: 'failed' })
    await new ThrottlesExceptions(cache, { namespace: 'tests', key: 'job:1', maxExceptions: 1, requireDistributed: false, when: () => true }).handle(new Probe().serialize(), createContainer(), next, { phase: 'failed' })
    expect(next).toHaveBeenCalledTimes(3)
  })

  it('rejects unsafe keys and release delays', () => {
    const cache = new InMemoryCache()
    expect(() => new WithoutOverlapping(cache, { namespace: 'tests', key: 'contains email@example.com', requireDistributed: false })).toThrow('safe identifier')
    expect(() => new WithoutOverlapping(cache, { namespace: 'tests', key: 'safe', releaseAfterMilliseconds: -1, requireDistributed: false })).toThrow('Release delay')
    expect(() => new ThrottlesExceptions(cache, { namespace: 'tests', key: 'safe', maxExceptions: 0, requireDistributed: false, when: () => true })).toThrow('Maximum exceptions')
    expect(() => new ThrottlesExceptions(cache, { namespace: 'tests', key: 'safe', maxExceptions: 1, decaySeconds: 86_401, requireDistributed: false, when: () => true })).toThrow('Decay seconds')
    expect(() => new ThrottlesExceptions(cache, { namespace: 'tests', key: 'safe', maxExceptions: 1, backoffMilliseconds: 0, requireDistributed: false, when: () => true })).toThrow('Exception backoff')
    expect(() => new ThrottlesExceptions(cache, { namespace: 'tests', key: 'safe', maxExceptions: 1, requireDistributed: false } as never)).toThrow('requires an error predicate')
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

  it('hashes exception-throttle keys and uses cache-clock delays', async () => {
    const cache = new InMemoryCache(() => 1000)
    const state = vi.spyOn(cache, 'fixedWindowState')
    const hit = vi.spyOn(cache, 'hitFixedWindow')
    const middleware = new ThrottlesExceptions(cache, { namespace: 'app:production', key: 'tenant:secret123:provider:mail', maxExceptions: 1, decaySeconds: 60, requireDistributed: false, when: () => true })

    await expect(middleware.handle(new Probe().serialize(), createContainer(), async () => {
      throw new Error('provider')
    }, { phase: 'process' })).rejects.toMatchObject({ delay: 60_000 })

    expect(state.mock.calls[0]?.[0]).toMatch(/^laravelize:queue-exception-throttle:v1:/)
    expect(hit.mock.calls[0]?.[0]).toBe(state.mock.calls[0]?.[0])
    expect(JSON.stringify([...state.mock.calls, ...hit.mock.calls])).not.toContain('secret123')
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
