import type { Cache, CacheTtl } from './Cache'

interface CacheEntry {
  value: unknown
  expiresAt: number | null
}

export class InMemoryCache implements Cache {
  readonly #entries = new Map<string, CacheEntry>()
  readonly #pending = new Map<string, Promise<unknown>>()
  #writesUntilSweep = 64

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const entry = this.#entry(key)
    return entry === undefined ? defaultValue : entry.value as T
  }

  async has(key: string): Promise<boolean> {
    return this.#entry(key) !== undefined
  }

  async put<T>(key: string, value: T, ttl?: CacheTtl): Promise<void> {
    assertKey(key)
    assertValue(value)
    const now = this.now()
    this.#maybeSweep(now)
    const expiresAt = resolveExpiration(ttl, now)
    this.#touch(key)
    if (expiresAt !== null && expiresAt <= now) {
      this.#entries.delete(key)
      return
    }
    this.#entries.set(key, { value, expiresAt })
  }

  forever<T>(key: string, value: T): Promise<void> {
    return this.put(key, value)
  }

  async add<T>(key: string, value: T, ttl?: CacheTtl): Promise<boolean> {
    assertKey(key)
    assertValue(value)
    const now = this.now()
    this.#maybeSweep(now)
    if (this.#entry(key, now) !== undefined) return false
    const expiresAt = resolveExpiration(ttl, now)
    if (expiresAt !== null && expiresAt <= now) return false
    this.#touch(key)
    this.#entries.set(key, { value, expiresAt })
    return true
  }

  async forget(key: string): Promise<boolean> {
    assertKey(key)
    this.#touch(key)
    return this.#entries.delete(key)
  }

  async flush(): Promise<void> {
    this.#entries.clear()
    this.#pending.clear()
    this.#writesUntilSweep = 64
  }

  async pull<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const entry = this.#entry(key)
    this.#touch(key)
    this.#entries.delete(key)
    return entry === undefined ? defaultValue : entry.value as T
  }

  async remember<T>(key: string, ttl: CacheTtl, factory: () => T | Promise<T>): Promise<T> {
    return await this.#remember(key, ttl, factory)
  }

  async rememberForever<T>(key: string, factory: () => T | Promise<T>): Promise<T> {
    return await this.#remember(key, undefined, factory)
  }

  async increment(key: string, amount = 1, ttl?: CacheTtl): Promise<number> {
    if (!Number.isFinite(amount)) throw new Error('Cache increment amount must be finite.')
    const now = this.now()
    this.#maybeSweep(now)
    const entry = this.#entry(key, now)
    if (entry !== undefined && (typeof entry.value !== 'number' || !Number.isFinite(entry.value))) {
      throw new TypeError('Cached value is not numeric.')
    }
    const current = entry === undefined ? 0 : entry.value as number
    const value = current + amount
    if (!Number.isFinite(value)) throw new Error('Cache counter result must be finite.')
    const expiresAt = entry?.expiresAt ?? resolveExpiration(ttl, now)
    this.#touch(key)
    if (expiresAt !== null && expiresAt <= now) return value
    this.#entries.set(key, { value, expiresAt })
    return value
  }

  decrement(key: string, amount = 1, ttl?: CacheTtl): Promise<number> {
    return this.increment(key, -amount, ttl)
  }

  #entry(key: string, now = this.now()): CacheEntry | undefined {
    assertKey(key)
    const entry = this.#entries.get(key)
    if (entry !== undefined && entry.expiresAt !== null && entry.expiresAt <= now) {
      this.#entries.delete(key)
      return undefined
    }
    return entry
  }

  async #remember<T>(key: string, ttl: CacheTtl | undefined, factory: () => T | Promise<T>): Promise<T> {
    const entry = this.#entry(key)
    if (entry !== undefined) return entry.value as T

    const existing = this.#pending.get(key)
    if (existing !== undefined) return await existing as T

    const pending = Promise.resolve().then(factory)
    this.#pending.set(key, pending)
    try {
      const value = await pending
      assertValue(value)
      if (this.#pending.get(key) === pending) await this.put(key, value, ttl)
      return value
    }
    finally {
      if (this.#pending.get(key) === pending) this.#pending.delete(key)
    }
  }

  #touch(key: string): void {
    this.#pending.delete(key)
  }

  #maybeSweep(now: number): void {
    this.#writesUntilSweep -= 1
    if (this.#writesUntilSweep > 0) return
    this.#writesUntilSweep = 64
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.#entries.delete(key)
    }
  }
}

function resolveExpiration(ttl: CacheTtl | undefined, now: number): number | null {
  if (ttl === undefined) return null
  const expiresAt = ttl instanceof Date ? ttl.getTime() : now + ttl * 1000
  if (!Number.isFinite(expiresAt)) throw new Error('Cache TTL must be a finite number of seconds or Date.')
  return expiresAt
}

function assertKey(key: string): void {
  if (!key.trim()) throw new Error('Cache key cannot be empty.')
}

function assertValue(value: unknown): void {
  if (value === undefined) throw new Error('Cache cannot store undefined values.')
}
