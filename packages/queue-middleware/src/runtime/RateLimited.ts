import { isAtomicFixedWindowCache, isDistributedCache, type AtomicFixedWindowCache } from '@luckys_luis/nuxt-laravelize-cache/runtime'
import { JobReleasedError, type JobExecutionMiddleware } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { RateLimiter, type RateLimitResult } from '@luckys_luis/nuxt-laravelize-rate-limiter/runtime'
import { releaseBudget, resolveMiddlewareKey, safeIdentifier, type JobMiddlewareKey } from './keys'

export interface RateLimitedOptions {
  readonly key: JobMiddlewareKey
  readonly namespace: string
  readonly maxAttempts: number
  readonly decaySeconds?: number
  readonly maxReleases?: number
  readonly requireDistributed?: boolean
}

export class RateLimited {
  readonly handle: JobExecutionMiddleware
  readonly #limiter: RateLimiter
  readonly #maxReleases: number

  constructor(cache: AtomicFixedWindowCache, options: RateLimitedOptions, now: () => number = Date.now) {
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts <= 0) throw new TypeError('Maximum attempts must be a positive integer')
    const decaySeconds = options.decaySeconds ?? 60
    if (!Number.isFinite(decaySeconds) || decaySeconds <= 0 || decaySeconds > 86_400) throw new TypeError('Decay seconds must be greater than 0 and at most 86400')
    this.#maxReleases = releaseBudget(options.maxReleases)
    if ((options.requireDistributed ?? true) && !isDistributedCache(cache)) {
      throw new Error('RateLimited requires a distributed owner-atomic cache.')
    }
    if (!isAtomicFixedWindowCache(cache)) throw new Error('RateLimited requires an atomic fixed-window cache.')
    safeIdentifier(options.namespace, 'namespace')
    if (typeof options.key === 'string') safeIdentifier(options.key, 'key')
    this.#limiter = new RateLimiter(cache, now, 'laravelize:queue-rate-limit:', true)
    this.handle = async (job, scope, next, descriptor) => {
      if (descriptor?.phase === 'failed') {
        await next()
        return
      }
      const key = await resolveMiddlewareKey(options.namespace, options.key, job, scope, descriptor)
      const result: RateLimitResult = await this.#limiter.hit(key, options.maxAttempts, decaySeconds)
      if (!result.allowed) throw new JobReleasedError(result.retryAfterMilliseconds, this.#maxReleases)
      await next()
    }
  }
}
