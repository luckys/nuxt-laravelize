import { isAtomicFixedWindowCache, type Cache } from '@nuxt-laravelize/cache/runtime'

export interface RateLimitResult {
  readonly allowed: boolean
  readonly attempts: number
  readonly remaining: number
  readonly retryAfter: number
  readonly retryAfterMilliseconds: number
  readonly resetAt: Date
}

export class RateLimiter {
  constructor(
    private readonly cache: Cache,
    private readonly now: () => number = Date.now,
    private readonly prefix = 'laravelize:rate-limit:',
    private readonly atomicFixedWindow = false,
  ) {}

  async hit(key: string, maxAttempts: number, decaySeconds = 60): Promise<RateLimitResult> {
    assertArguments(key, maxAttempts, decaySeconds)
    if (this.atomicFixedWindow) {
      if (!isAtomicFixedWindowCache(this.cache)) throw new Error('Atomic fixed-window rate limiting requires a compatible cache.')
      const state = await this.cache.hitFixedWindow(this.#atomicKey(key), windowMilliseconds(decaySeconds))
      return {
        allowed: state.attempts <= maxAttempts,
        attempts: state.attempts,
        remaining: Math.max(0, maxAttempts - state.attempts),
        retryAfter: Math.ceil(state.retryAfterMilliseconds / 1000),
        retryAfterMilliseconds: state.retryAfterMilliseconds,
        resetAt: new Date(state.resetAt),
      }
    }
    const now = this.now()
    const resetAt = now + decaySeconds * 1000
    const timerKey = this.#timerKey(key)
    await this.cache.add(timerKey, resetAt, decaySeconds)
    const storedResetAt = await this.cache.get<number>(timerKey, resetAt)
    const attempts = await this.cache.increment(this.#attemptsKey(key, storedResetAt!), 1, new Date(storedResetAt!))
    const retryAfter = Math.max(0, Math.ceil((storedResetAt! - now) / 1000))

    return {
      allowed: attempts <= maxAttempts,
      attempts,
      remaining: Math.max(0, maxAttempts - attempts),
      retryAfter,
      retryAfterMilliseconds: Math.max(1, storedResetAt! - now),
      resetAt: new Date(storedResetAt!),
    }
  }

  async attempts(key: string): Promise<number> {
    assertKey(key)
    if (this.atomicFixedWindow) {
      if (!isAtomicFixedWindowCache(this.cache)) throw new Error('Atomic fixed-window rate limiting requires a compatible cache.')
      return (await this.cache.fixedWindowState(this.#atomicKey(key)))?.attempts ?? 0
    }
    const resetAt = await this.cache.get<number>(this.#timerKey(key))
    if (resetAt === undefined) return 0
    return await this.cache.get<number>(this.#attemptsKey(key, resetAt), 0) ?? 0
  }

  async remaining(key: string, maxAttempts: number): Promise<number> {
    assertKey(key)
    assertPositiveInteger(maxAttempts, 'Maximum attempts')
    return Math.max(0, maxAttempts - await this.attempts(key))
  }

  async clear(key: string): Promise<void> {
    assertKey(key)
    if (this.atomicFixedWindow) {
      if (!isAtomicFixedWindowCache(this.cache)) throw new Error('Atomic fixed-window rate limiting requires a compatible cache.')
      await this.cache.clearFixedWindow(this.#atomicKey(key))
      return
    }
    const timerKey = this.#timerKey(key)
    const resetAt = await this.cache.get<number>(timerKey)
    const removals = [this.cache.forget(timerKey)]
    if (resetAt !== undefined) removals.push(this.cache.forget(this.#attemptsKey(key, resetAt)))
    await Promise.all(removals)
  }

  #attemptsKey(key: string, resetAt: number): string {
    return `${this.prefix}${key}:${resetAt}:attempts`
  }

  #timerKey(key: string): string {
    return `${this.prefix}${key}:timer`
  }

  #atomicKey(key: string): string {
    return `${this.prefix}${key}:window`
  }
}

function assertArguments(key: string, maxAttempts: number, decaySeconds: number): void {
  assertKey(key)
  assertPositiveInteger(maxAttempts, 'Maximum attempts')
  if (!Number.isFinite(decaySeconds) || decaySeconds <= 0) {
    throw new Error('Decay seconds must be a positive finite number.')
  }
}

function assertKey(key: string): void {
  if (!key.trim()) throw new Error('Rate limit key cannot be empty.')
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`)
}

function windowMilliseconds(decaySeconds: number): number {
  const value = Math.ceil(decaySeconds * 1000)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Decay seconds must produce a positive safe millisecond window.')
  return value
}
