import type { Cache } from './Cache'

export class LockTimeoutError extends Error {
  constructor(readonly lockName: string) {
    super(`Timed out waiting for lock "${lockName}".`)
    this.name = 'LockTimeoutError'
  }
}

export class CacheLock {
  readonly owner: string
  readonly #key: string

  constructor(
    private readonly cache: Cache,
    readonly name: string,
    private readonly ttlSeconds: number,
    owner: string = crypto.randomUUID(),
    private readonly now: () => number = Date.now,
    private readonly sleep: (milliseconds: number) => Promise<void> = delay,
  ) {
    if (!name.trim()) throw new Error('Lock name cannot be empty.')
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error('Lock TTL must be a positive finite number of seconds.')
    if (!owner.trim()) throw new Error('Lock owner cannot be empty.')
    this.owner = owner
    this.#key = `laravelize:lock:${name}`
  }

  acquire(): Promise<boolean> {
    return this.cache.add(this.#key, this.owner, this.ttlSeconds)
  }

  release(): Promise<boolean> {
    return this.cache.forgetIf(this.#key, this.owner)
  }

  renew(ttlSeconds = this.ttlSeconds): Promise<boolean> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error('Lock TTL must be a positive finite number of seconds.')
    if (!this.cache.expireIf) return Promise.resolve(false)
    return this.cache.expireIf(this.#key, this.owner, ttlSeconds)
  }

  forceRelease(): Promise<boolean> {
    return this.cache.forget(this.#key)
  }

  async owned(): Promise<boolean> {
    return Object.is(await this.cache.get(this.#key), this.owner)
  }

  async run<T>(callback: () => T | Promise<T>): Promise<T | undefined> {
    if (!await this.acquire()) return undefined
    try {
      return await callback()
    }
    finally {
      await this.release()
    }
  }

  async block<T>(waitSeconds: number, callback: () => T | Promise<T>, pollMilliseconds = 250): Promise<T> {
    if (!Number.isFinite(waitSeconds) || waitSeconds < 0) throw new Error('Lock wait must be a non-negative finite number of seconds.')
    if (!Number.isFinite(pollMilliseconds) || pollMilliseconds <= 0) throw new Error('Lock poll interval must be a positive finite number of milliseconds.')
    const deadline = this.now() + waitSeconds * 1000

    while (!await this.acquire()) {
      const remaining = deadline - this.now()
      if (remaining <= 0) throw new LockTimeoutError(this.name)
      await this.sleep(Math.min(pollMilliseconds, remaining))
    }

    try {
      return await callback()
    }
    finally {
      await this.release()
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
