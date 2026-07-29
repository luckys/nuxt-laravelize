import { atomicFixedWindowCacheCapabilities, atomicFixedWindowCacheCapability, distributedCacheCapability, distributedOwnerAtomicCacheCapabilities, type AtomicFixedWindowCache, type CacheTtl, type DistributedCache, type FixedWindowState } from '@nuxt-laravelize/cache/runtime'
import { CacheCorruptionError, defaultCacheSerializer, type JsonCacheValue, numericPayloadPrefix } from './JsonCacheSerializer'

/* eslint-disable @stylistic/max-statements-per-line -- compact command adapter methods keep Redis operations auditable */

export interface RedisCacheClient {
  get(key: string): Promise<string | null>
  exists(key: string): Promise<number>
  set(key: string, value: string, mode?: 'NX'): Promise<string | null>
  set(key: string, value: string, mode: 'PX', milliseconds: number, condition?: 'NX'): Promise<string | null>
  del(...keys: string[]): Promise<number>
  unlink?(...keys: string[]): Promise<number>
  scan(cursor: string, matchToken: 'MATCH', pattern: string, countToken: 'COUNT', count: number): Promise<[string, string[]]>
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>
  /** Present on ioredis Cluster clients. Prefix-scoped flush is unsupported for clusters. */
  nodes?(role?: 'all' | 'master' | 'slave'): unknown[]
}

export interface RedisCacheOptions { prefix?: string, scanCount?: number }

const PULL = `local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]) end; return v`
const COMPARE_DELETE = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`
const COMPARE_EXPIRE = `if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; local ttl=tonumber(ARGV[2]); if ttl<=0 then redis.call('DEL',KEYS[1]) else redis.call('PEXPIRE',KEYS[1],ttl) end; return 1`
const COUNTER = `local raw=redis.call('GET',KEYS[1]); local ttl=-2; local current=0; if raw then ttl=redis.call('PTTL',KEYS[1]); if ttl==-1 or ttl>0 then if string.sub(raw,1,string.len(ARGV[1]))~=ARGV[1] then return redis.error_reply('CACHE_NOT_NUMERIC') end; current=tonumber(string.sub(raw,string.len(ARGV[1])+1)); if not current then return redis.error_reply('CACHE_CORRUPT') end; else raw=false end; end; local amount=tonumber(ARGV[2]); local result=current+amount; if result~=result or result==math.huge or result==-math.huge then return redis.error_reply('CACHE_NONFINITE') end; local serialized=string.format('%.17g',result); if tonumber(serialized)~=result then return redis.error_reply('CACHE_CORRUPT') end; local encoded=ARGV[1]..serialized; if raw and ttl==-1 then redis.call('SET',KEYS[1],encoded); elseif raw and ttl>0 then redis.call('SET',KEYS[1],encoded,'PX',ttl); elseif ARGV[3]=='0' then redis.call('SET',KEYS[1],encoded); elseif tonumber(ARGV[4])>0 then redis.call('SET',KEYS[1],encoded,'PX',ARGV[4]); end; return encoded`
const FIXED_WINDOW_HIT = `local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000); local window=tonumber(ARGV[1]); local reset=tonumber(redis.call('HGET',KEYS[1],'reset')); local attempts=tonumber(redis.call('HGET',KEYS[1],'attempts')); if not reset or reset<=now then reset=now+window; attempts=1 else attempts=(attempts or 0)+1 end; redis.call('HSET',KEYS[1],'reset',reset,'attempts',attempts); redis.call('PEXPIREAT',KEYS[1],reset); return {attempts,reset,math.max(1,reset-now)}`
const FIXED_WINDOW_STATE = `local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000); local reset=tonumber(redis.call('HGET',KEYS[1],'reset')); local attempts=tonumber(redis.call('HGET',KEYS[1],'attempts')); if not reset or reset<=now or not attempts then return nil end; return {attempts,reset,math.max(1,reset-now)}`

export class RedisCache implements DistributedCache, AtomicFixedWindowCache {
  readonly [distributedCacheCapability] = distributedOwnerAtomicCacheCapabilities
  readonly [atomicFixedWindowCacheCapability] = atomicFixedWindowCacheCapabilities
  readonly #prefix: string
  readonly #scanCount: number
  readonly #pending = new Map<string, Promise<unknown>>()

  constructor(readonly client: RedisCacheClient, options: RedisCacheOptions = {}) {
    this.#prefix = options.prefix ?? 'laravelize:cache:'
    assertPrefix(this.#prefix)
    this.#scanCount = options.scanCount ?? 100
    if (!Number.isInteger(this.#scanCount) || this.#scanCount < 1 || this.#scanCount > 10_000) throw new Error('Redis cache scanCount must be an integer between 1 and 10000.')
  }

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const payload = await this.client.get(this.#key(key))
    return payload === null ? defaultValue : defaultCacheSerializer.decode(payload) as T
  }

  async has(key: string): Promise<boolean> { return await this.client.exists(this.#key(key)) > 0 }
  async put<T>(key: string, value: T, ttl?: CacheTtl): Promise<void> {
    const redisKey = this.#key(key); const payload = encode(value); const milliseconds = ttlMilliseconds(ttl)
    this.#touch(key)
    if (milliseconds !== null && milliseconds <= 0) { await this.client.del(redisKey); return }
    if (milliseconds === null) await this.client.set(redisKey, payload)
    else await this.client.set(redisKey, payload, 'PX', milliseconds)
  }

  forever<T>(key: string, value: T): Promise<void> { return this.put(key, value) }
  async add<T>(key: string, value: T, ttl?: CacheTtl): Promise<boolean> {
    const redisKey = this.#key(key); const payload = encode(value); const milliseconds = ttlMilliseconds(ttl)
    if (milliseconds !== null && milliseconds <= 0) return false
    this.#touch(key)
    const result = milliseconds === null ? await this.client.set(redisKey, payload, 'NX') : await this.client.set(redisKey, payload, 'PX', milliseconds, 'NX')
    return result === 'OK'
  }

  async forget(key: string): Promise<boolean> { this.#touch(key); return await this.client.del(this.#key(key)) > 0 }
  async forgetIf<T>(key: string, expected: T): Promise<boolean> { this.#touch(key); return Number(await this.client.eval(COMPARE_DELETE, 1, this.#key(key), encode(expected))) === 1 }
  async expireIf<T>(key: string, expected: T, ttl: CacheTtl): Promise<boolean> { this.#touch(key); return Number(await this.client.eval(COMPARE_EXPIRE, 1, this.#key(key), encode(expected), ttlMilliseconds(ttl)!)) === 1 }
  async pull<T>(key: string, defaultValue?: T): Promise<T | undefined> { this.#touch(key); const payload = await this.client.eval(PULL, 1, this.#key(key)); return payload === null ? defaultValue : defaultCacheSerializer.decode(String(payload)) as T }
  async flush(): Promise<void> {
    if (typeof this.client.nodes === 'function') throw new Error('RedisCache.flush() is unsupported for ioredis Cluster clients; flush each primary with an explicitly scoped strategy.')
    this.#pending.clear()
    let cursor = '0'; const pattern = `${escapeGlob(this.#prefix)}*`
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', this.#scanCount)
      if (keys.length) await (this.client.unlink ? this.client.unlink(...keys) : this.client.del(...keys))
      cursor = next
    } while (cursor !== '0')
  }

  remember<T>(key: string, ttl: CacheTtl, factory: () => T | Promise<T>): Promise<T> { return this.#remember(key, ttl, factory) }
  rememberForever<T>(key: string, factory: () => T | Promise<T>): Promise<T> { return this.#remember(key, undefined, factory) }
  async increment(key: string, amount = 1, ttl?: CacheTtl): Promise<number> {
    assertFiniteAmount(amount); this.#touch(key)
    const milliseconds = ttlMilliseconds(ttl)
    const result = await this.client.eval(COUNTER, 1, this.#key(key), numericPayloadPrefix, amount, milliseconds === null ? 0 : 1, milliseconds ?? 0)
    const decoded = defaultCacheSerializer.decode(String(result)); if (typeof decoded !== 'number') throw new CacheCorruptionError('Counter returned a malformed value.')
    return decoded
  }

  decrement(key: string, amount = 1, ttl?: CacheTtl): Promise<number> { assertFiniteAmount(amount); return this.increment(key, -amount, ttl) }
  async hitFixedWindow(key: string, windowMilliseconds: number): Promise<FixedWindowState> { assertWindow(windowMilliseconds); this.#touch(key); const state = fixedWindowState(await this.client.eval(FIXED_WINDOW_HIT, 1, this.#key(key), windowMilliseconds)); if (!state) throw new CacheCorruptionError('Fixed-window hit returned no state.'); return state }
  async fixedWindowState(key: string): Promise<FixedWindowState | undefined> { return fixedWindowState(await this.client.eval(FIXED_WINDOW_STATE, 1, this.#key(key))) }
  async clearFixedWindow(key: string): Promise<boolean> { this.#touch(key); return await this.client.del(this.#key(key)) > 0 }

  async #remember<T>(key: string, ttl: CacheTtl | undefined, factory: () => T | Promise<T>): Promise<T> {
    const existing = this.#pending.get(key); if (existing) return await existing as T
    const found = await this.get<T>(key); if (found !== undefined) return found
    const startedWhileReading = this.#pending.get(key); if (startedWhileReading) return await startedWhileReading as T
    const pending = Promise.resolve().then(factory); this.#pending.set(key, pending)
    try { const value = await pending; encode(value); if (this.#pending.get(key) === pending) await this.add(key, value, ttl); return value }
    finally { if (this.#pending.get(key) === pending) this.#pending.delete(key) }
  }

  #key(key: string): string { assertKey(key); return this.#prefix + key }
  #touch(key: string): void { this.#pending.delete(key) }
}

function encode(value: unknown): string { return defaultCacheSerializer.encode(value as JsonCacheValue) }
function ttlMilliseconds(ttl: CacheTtl | undefined): number | null { if (ttl === undefined) return null; const value = ttl instanceof Date ? ttl.getTime() - Date.now() : ttl * 1000; if (!Number.isFinite(value)) throw new Error('Cache TTL must be a finite number of seconds or valid Date.'); const milliseconds = Math.ceil(value); if (milliseconds > 0 && !Number.isSafeInteger(milliseconds)) throw new Error('Cache TTL rounded to milliseconds must be a positive safe integer supported by Redis.'); return milliseconds }
function assertKey(key: string): void { if (typeof key !== 'string' || !key.trim() || key.length > 1024 || key.includes('\0')) throw new Error('Cache key must be a non-empty string of at most 1024 characters without NUL bytes.') }
function assertPrefix(prefix: string): void { if (!prefix || prefix.length > 256 || prefix.includes('\0')) throw new Error('Redis cache prefix must be a non-empty string of at most 256 characters without NUL bytes.'); if (!prefix.endsWith(':')) throw new Error('Redis cache prefix must end with a colon (:).') }
function assertFiniteAmount(amount: number): void { if (!Number.isFinite(amount)) throw new Error('Cache counter amount must be finite.') }
function assertWindow(value: number): void { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Fixed window must be a positive safe integer in milliseconds.') }
function fixedWindowState(value: unknown): FixedWindowState | undefined { if (value === null || value === undefined) return undefined; if (!Array.isArray(value) || value.length !== 3) throw new CacheCorruptionError('Fixed-window operation returned malformed state.'); const attempts = Number(value[0]); const resetAt = Number(value[1]); const retryAfterMilliseconds = Number(value[2]); if (!Number.isSafeInteger(attempts) || attempts < 1 || !Number.isSafeInteger(resetAt) || resetAt < 1 || !Number.isSafeInteger(retryAfterMilliseconds) || retryAfterMilliseconds < 1) throw new CacheCorruptionError('Fixed-window operation returned malformed state.'); return { attempts, resetAt, retryAfterMilliseconds } }
function escapeGlob(value: string): string { return value.replaceAll('\\', '\\\\').replaceAll('*', '\\*').replaceAll('?', '\\?').replaceAll('[', '\\[') }
