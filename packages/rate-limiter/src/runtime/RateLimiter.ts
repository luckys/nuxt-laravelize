import type { Cache } from '@nuxt-laravelize/cache/runtime'

export interface RateLimitResult {
  readonly allowed: boolean
  readonly attempts: number
  readonly remaining: number
  readonly retryAfter: number
  readonly resetAt: Date
}

export class RateLimiter {
  constructor(
    private readonly cache: Cache,
    private readonly now: () => number = Date.now,
    private readonly prefix = 'laravelize:rate-limit:',
  ) {}

  async hit(key: string, maxAttempts: number, decaySeconds = 60): Promise<RateLimitResult> {
    assertArguments(key, maxAttempts, decaySeconds)
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
      resetAt: new Date(storedResetAt!),
    }
  }

  async attempts(key: string): Promise<number> {
    assertKey(key)
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
