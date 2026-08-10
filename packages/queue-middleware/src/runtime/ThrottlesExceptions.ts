import type { Container } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { isAtomicFixedWindowCache, isDistributedCache, type AtomicFixedWindowCache } from '@luckys_luis/nuxt-laravelize-cache/runtime'
import { isJobReleasedError, isNonRetryableJobError, JobReleasedError, type JobExecutionDescriptor, type JobExecutionMiddleware, type SerializedJob } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { releaseBudget, resolveMiddlewareKey, safeIdentifier, type JobMiddlewareKey } from './keys'

export type ExceptionThrottlePredicate = (error: unknown, job: SerializedJob, scope: Container, descriptor?: JobExecutionDescriptor) => boolean | Promise<boolean>

export interface ThrottlesExceptionsOptions {
  readonly key: JobMiddlewareKey
  readonly namespace: string
  readonly maxExceptions: number
  readonly decaySeconds?: number
  readonly backoffMilliseconds?: number
  readonly maxReleases?: number
  readonly requireDistributed?: boolean
  readonly when: ExceptionThrottlePredicate
}

export class ExceptionThrottleOpenError extends Error {
  constructor() {
    super('Queue exception throttle is open for the current fixed window.')
    this.name = 'ExceptionThrottleOpenError'
  }
}

export class ExceptionThrottlePredicateError extends Error {
  constructor(jobError: unknown, predicateError: unknown) {
    super('Queue exception throttle predicate failed.', {
      cause: new AggregateError([jobError, predicateError], 'Job execution and exception-throttle predicate both failed.'),
    })
    this.name = 'ExceptionThrottlePredicateError'
  }
}

export class ExceptionThrottleRecordingError extends Error {
  constructor(jobError: unknown, cacheError: unknown) {
    super('Queue exception throttle could not record an eligible failure.', {
      cause: new AggregateError([jobError, cacheError], 'Job execution and exception-throttle recording both failed.'),
    })
    this.name = 'ExceptionThrottleRecordingError'
  }
}

export class ThrottlesExceptions {
  readonly handle: JobExecutionMiddleware
  readonly #windowMilliseconds: number
  readonly #backoffMilliseconds: number
  readonly #maxReleases: number

  constructor(private readonly cache: AtomicFixedWindowCache, private readonly options: ThrottlesExceptionsOptions) {
    if (!Number.isSafeInteger(options.maxExceptions) || options.maxExceptions <= 0) throw new TypeError('Maximum exceptions must be a positive safe integer')
    const decaySeconds = options.decaySeconds ?? 600
    if (!Number.isFinite(decaySeconds) || decaySeconds <= 0 || decaySeconds > 86_400) throw new TypeError('Decay seconds must be greater than 0 and at most 86400')
    this.#windowMilliseconds = Math.ceil(decaySeconds * 1000)
    this.#backoffMilliseconds = delay(options.backoffMilliseconds ?? 1000)
    this.#maxReleases = releaseBudget(options.maxReleases ?? 100)
    if (typeof options.when !== 'function') throw new TypeError('Exception throttle requires an error predicate')
    if ((options.requireDistributed ?? true) && !isDistributedCache(cache)) {
      throw new Error('ThrottlesExceptions requires a distributed owner-atomic cache.')
    }
    if (!isAtomicFixedWindowCache(cache)) throw new Error('ThrottlesExceptions requires an atomic fixed-window cache.')
    safeIdentifier(options.namespace, 'namespace')
    if (typeof options.key === 'string') safeIdentifier(options.key, 'key')
    this.handle = async (job, scope, next, descriptor) => {
      if (descriptor?.phase === 'failed') {
        await next()
        return
      }
      const digest = await resolveMiddlewareKey(options.namespace, options.key, job, scope, descriptor)
      const key = `laravelize:queue-exception-throttle:${digest}:window`
      const current = await this.cache.fixedWindowState(key)
      if (current && current.attempts >= options.maxExceptions) {
        throw new JobReleasedError(current.retryAfterMilliseconds, this.#maxReleases, { cause: new ExceptionThrottleOpenError() })
      }
      try {
        await next()
      }
      catch (error) {
        if (isJobReleasedError(error) || isNonRetryableJobError(error)) throw error
        let eligible: boolean
        let releaseCause = error
        try {
          eligible = await options.when(error, job, scope, descriptor)
        }
        catch (predicateError) {
          eligible = true
          releaseCause = new ExceptionThrottlePredicateError(error, predicateError)
        }
        if (!eligible) throw error
        let recorded
        try {
          recorded = await this.cache.hitFixedWindow(key, this.#windowMilliseconds)
        }
        catch (cacheError) {
          throw new ExceptionThrottleRecordingError(releaseCause, cacheError)
        }
        const releaseAfter = recorded.attempts >= options.maxExceptions ? recorded.retryAfterMilliseconds : this.#backoffMilliseconds
        throw new JobReleasedError(releaseAfter, this.#maxReleases, { cause: releaseCause })
      }
    }
  }
}

function delay(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) throw new TypeError('Exception backoff must be an integer between 1 and 86400000')
  return value
}
