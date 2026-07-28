import { CacheLock, isDistributedCache, type DistributedCache } from '@nuxt-laravelize/cache/runtime'
import { SchedulerLockLostError, type SchedulerLockLease, type SchedulerLockProvider, type SchedulerOccurrenceClaim } from './runtime'

export interface CacheLockSchedulerLockProviderOptions {
  /** Fraction of the TTL to wait between owner-atomic renewals. */
  readonly renewalIntervalRatio?: number
}

export class CacheLockSchedulerLockProvider implements SchedulerLockProvider {
  readonly capabilities = Object.freeze({ distributed: true as const })
  readonly #renewalIntervalRatio: number

  constructor(
    private readonly cache: DistributedCache,
    options: CacheLockSchedulerLockProviderOptions = {},
  ) {
    if (!isDistributedCache(cache)) throw new Error('CacheLockSchedulerLockProvider requires a distributed owner-atomic cache.')
    this.#renewalIntervalRatio = options.renewalIntervalRatio ?? 0.5
    if (!Number.isFinite(this.#renewalIntervalRatio) || this.#renewalIntervalRatio <= 0 || this.#renewalIntervalRatio >= 1) {
      throw new Error('Lock renewal interval ratio must be greater than 0 and less than 1.')
    }
  }

  async claim(key: string, expiresAfterSeconds: number): Promise<SchedulerOccurrenceClaim | null> {
    const intervalMilliseconds = this.renewalInterval(expiresAfterSeconds)
    const lock = new CacheLock(this.cache, key, expiresAfterSeconds)
    if (!await lock.acquire()) return null
    let active = true
    let completed = false
    let released = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let renewal: Promise<void> | undefined
    let lost: SchedulerLockLostError | undefined
    const markLost = (cause?: unknown): SchedulerLockLostError => {
      lost ??= new SchedulerLockLostError(`Scheduler occurrence claim "${key}" was lost before completion.`, cause === undefined ? undefined : { cause })
      return lost
    }
    const scheduleRenewal = (): void => {
      timer = setTimeout(() => {
        renewal = (async () => {
          try {
            if (!await lock.renew()) markLost()
          }
          catch (error) { markLost(error) }
          finally {
            renewal = undefined
            if (active && !lost) scheduleRenewal()
          }
        })()
      }, intervalMilliseconds)
      timer.unref?.()
    }
    const stopRenewal = async (): Promise<void> => {
      active = false
      if (timer) clearTimeout(timer)
      await renewal
    }
    scheduleRenewal()
    return {
      complete: async () => {
        if (completed) return
        await stopRenewal()
        if (lost) throw lost
        try {
          if (!await lock.renew(expiresAfterSeconds)) throw markLost()
        }
        catch (error) {
          throw error instanceof SchedulerLockLostError ? error : markLost(error)
        }
        completed = true
      },
      release: async () => {
        if (completed || released) return
        released = true
        await stopRenewal()
        if (!await lock.release()) throw lost ?? new SchedulerLockLostError(`Scheduler occurrence claim "${key}" was lost before it could be released.`)
      },
    }
  }

  async acquire(key: string, expiresAfterSeconds: number): Promise<SchedulerLockLease | null> {
    const intervalMilliseconds = this.renewalInterval(expiresAfterSeconds)
    const lock = new CacheLock(this.cache, key, expiresAfterSeconds)
    if (!await lock.acquire()) return null

    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let renewal: Promise<void> | undefined
    let lost: SchedulerLockLostError | undefined
    const controller = new AbortController()

    const markLost = (cause?: unknown): SchedulerLockLostError => {
      lost ??= new SchedulerLockLostError(`Scheduler lock "${key}" was lost before execution completed.`, cause === undefined ? undefined : { cause })
      if (!controller.signal.aborted) controller.abort(lost)
      return lost
    }
    const scheduleRenewal = (): void => {
      timer = setTimeout(() => {
        renewal = (async () => {
          try {
            if (!await lock.renew()) markLost()
          }
          catch (error) {
            markLost(error)
          }
          finally {
            renewal = undefined
            if (active && !lost) scheduleRenewal()
          }
        })()
      }, intervalMilliseconds)
      timer.unref?.()
    }
    scheduleRenewal()

    return {
      signal: controller.signal,
      assertOwned: async () => {
        if (lost) throw lost
        if (!await lock.owned()) throw markLost()
        if (lost) throw lost
      },
      release: async () => {
        if (!active) return
        active = false
        if (timer) clearTimeout(timer)
        await renewal
        if (lost) throw lost
        try {
          if (!await lock.release()) throw markLost()
        }
        catch (error) {
          throw error instanceof SchedulerLockLostError ? error : markLost(error)
        }
      },
    }
  }

  private renewalInterval(expiresAfterSeconds: number): number {
    const intervalMilliseconds = expiresAfterSeconds * 1000 * this.#renewalIntervalRatio
    if (!Number.isFinite(intervalMilliseconds) || intervalMilliseconds < 1 || intervalMilliseconds > 2_147_483_647) {
      throw new Error('Lock TTL produces a renewal interval outside the supported timer range.')
    }
    return intervalMilliseconds
  }
}
