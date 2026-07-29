import { CacheLock, isDistributedCache, type Cache } from '@nuxt-laravelize/cache/runtime'
import { JobReleasedError, type JobExecutionMiddleware } from '@nuxt-laravelize/queue/runtime'
import { releaseBudget, resolveMiddlewareKey, safeIdentifier, type JobMiddlewareKey } from './keys'

export interface WithoutOverlappingOptions {
  readonly key: JobMiddlewareKey
  readonly namespace: string
  readonly expiresAfterSeconds?: number
  readonly releaseAfterMilliseconds?: number
  readonly maxReleases?: number
  readonly renewalIntervalRatio?: number
  readonly requireDistributed?: boolean
}

export class JobOverlapLockLostError extends Error {
  constructor(readonly lockId: string, options?: ErrorOptions) {
    super('Queue overlap lock was lost before execution completed.', options)
    this.name = 'JobOverlapLockLostError'
  }
}

export class WithoutOverlapping {
  readonly handle: JobExecutionMiddleware
  readonly #expiresAfterSeconds: number
  readonly #releaseAfterMilliseconds: number
  readonly #maxReleases: number
  readonly #renewalIntervalMilliseconds: number

  constructor(private readonly cache: Cache, private readonly options: WithoutOverlappingOptions) {
    this.#expiresAfterSeconds = positive(options.expiresAfterSeconds ?? 60, 'Lock expiration seconds')
    this.#releaseAfterMilliseconds = delay(options.releaseAfterMilliseconds ?? 1000)
    this.#maxReleases = releaseBudget(options.maxReleases)
    const renewalRatio = options.renewalIntervalRatio ?? 0.5
    if (!Number.isFinite(renewalRatio) || renewalRatio <= 0 || renewalRatio >= 1) throw new TypeError('Renewal interval ratio must be greater than 0 and less than 1')
    this.#renewalIntervalMilliseconds = this.#expiresAfterSeconds * renewalRatio * 1000
    if (this.#renewalIntervalMilliseconds < 1 || this.#renewalIntervalMilliseconds > 2_147_483_647) throw new TypeError('Lock renewal interval is outside the supported timer range')
    if ((options.requireDistributed ?? true) && !isDistributedCache(cache)) {
      throw new Error('WithoutOverlapping requires a distributed owner-atomic cache.')
    }
    safeIdentifier(options.namespace, 'namespace')
    if (typeof options.key === 'string') safeIdentifier(options.key, 'key')
    this.handle = async (job, scope, next, descriptor) => {
      if (descriptor?.phase === 'failed') {
        await next()
        return
      }
      const lockId = await resolveMiddlewareKey(options.namespace, options.key, job, scope, descriptor)
      const lock = new CacheLock(this.cache, `queue-overlap:${lockId}`, this.#expiresAfterSeconds)
      if (!await lock.acquire()) throw new JobReleasedError(this.#releaseAfterMilliseconds, this.#maxReleases)
      let active = true
      let timer: ReturnType<typeof setTimeout> | undefined
      let renewal: Promise<void> | undefined
      let lost: JobOverlapLockLostError | undefined
      const scheduleRenewal = (): void => {
        timer = setTimeout(() => {
          renewal = (async () => {
            try {
              if (!await lock.renew()) lost ??= new JobOverlapLockLostError(lockId)
            }
            catch (error) { lost ??= new JobOverlapLockLostError(lockId, { cause: error }) }
            renewal = undefined
            if (active && !lost) scheduleRenewal()
          })()
        }, this.#renewalIntervalMilliseconds)
        timer.unref?.()
      }
      scheduleRenewal()
      let didFail = false
      let operationError: unknown
      try {
        await next()
      }
      catch (error) {
        didFail = true
        operationError = error
      }
      active = false
      if (timer) clearTimeout(timer)
      await renewal
      let releaseError: unknown
      try {
        if (!await lock.release()) lost ??= new JobOverlapLockLostError(lockId)
      }
      catch (error) { releaseError = error }
      if (didFail) throw operationError
      if (lost) throw lost
      if (releaseError) throw releaseError
    }
  }
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a positive finite number`)
  return value
}

function delay(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) throw new TypeError('Release delay must be an integer between 1 and 86400000')
  return value
}
