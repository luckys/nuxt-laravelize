import Redis from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { CacheLock } from '@nuxt-laravelize/cache/runtime'
import { CacheCorruptionError, RedisCache } from '../../src/index'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.CACHE_REDIS_REQUIRED === '1'
const clients: Redis[] = []
let available = false
const prefix = `laravelize:test:${process.pid}:${Date.now()}:*scope?:`
let first: RedisCache
let second: RedisCache

if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when CACHE_REDIS_REQUIRED=1.')

if (redisUrl) {
  const a = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1_000 })
  const b = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1_000 })
  clients.push(a, b)
  try {
    await Promise.all([a.connect(), b.connect()])
    available = true
    first = new RedisCache(a, { prefix })
    second = new RedisCache(b, { prefix })
  }
  catch (error) {
    a.disconnect()
    b.disconnect()
    throw new Error(`Redis integration connection failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

describe.skipIf(!available)('RedisCache integration', () => {
  afterAll(async () => {
    if (available) await first.flush()
    await Promise.all(clients.map(async client => client.disconnect()))
  })

  it('coordinates atomic add and pull across clients', async () => {
    if (!available) return
    const added = await Promise.all([first.add('once', 'a'), second.add('once', 'b')])
    expect(added.filter(Boolean)).toHaveLength(1)
    const pulled = await Promise.all([first.pull('once'), second.pull('once')])
    expect(pulled.filter(value => value !== undefined)).toHaveLength(1)
  })

  it('coordinates fixed-window hits atomically across clients', async () => {
    if (!available) return
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).hitFixedWindow('shared-window', 60_000)))
    expect(results.map(result => result.attempts).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
  })

  it('leaves an existing value and TTL untouched when add has a nonpositive TTL', async () => {
    if (!available) return
    const client = clients[0]!
    await first.put('add-preserve', 'original', 10)
    const ttlBefore = await client.pttl(`${prefix}add-preserve`)
    await expect(first.add('add-preserve', 'replacement', 0)).resolves.toBe(false)
    const ttlAfter = await client.pttl(`${prefix}add-preserve`)
    expect(await second.get('add-preserve')).toBe('original')
    expect(ttlAfter).toBeGreaterThan(0)
    expect(ttlAfter).toBeLessThanOrEqual(ttlBefore)
  })

  it('coalesces remember locally and invalidates a pending write after mutation', async () => {
    if (!available) return
    let calls = 0
    let resolve!: (value: string) => void
    let started!: () => void
    const factoryStarted = new Promise<void>((done) => {
      started = done
    })
    const pending = first.remember('remember', 60, () => new Promise<string>((done) => {
      calls += 1
      resolve = done
      started()
    }))
    await factoryStarted
    const coalesced = first.remember('remember', 60, async () => 'unexpected')
    await first.put('remember', 'newer')
    resolve('stale')
    await expect(Promise.all([pending, coalesced])).resolves.toEqual(['stale', 'stale'])
    expect(calls).toBe(1)
    expect(await second.get('remember')).toBe('newer')
  })

  it('does not overwrite another client write completed while remember is pending', async () => {
    if (!available) return
    let resolve!: (value: string) => void
    let started!: () => void
    const factoryStarted = new Promise<void>((done) => {
      started = done
    })
    const pending = first.remember('distributed-remember', 60, () => new Promise<string>((done) => {
      resolve = done
      started()
    }))
    await factoryStarted
    await second.put('distributed-remember', 'external', 30)
    resolve('factory')
    await expect(pending).resolves.toBe('factory')
    expect(await first.get('distributed-remember')).toBe('external')
  })

  it('increments atomically from zero and preserves the initial TTL', async () => {
    if (!available) return
    await first.increment('counter', 1, 1)
    await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).increment('counter')))
    expect(await first.get('counter')).toBe(21)
    await new Promise(resolve => setTimeout(resolve, 1_050))
    expect(await first.get('counter')).toBeUndefined()
    await first.put('text', 'one')
    await expect(first.increment('text')).rejects.toThrow('CACHE_NOT_NUMERIC')
  })

  it('preserves Redis Lua double precision for large and fractional counters', async () => {
    if (!available) return
    await first.put('large-counter', Number.MAX_SAFE_INTEGER - 1)
    await expect(first.increment('large-counter')).resolves.toBe(Number.MAX_SAFE_INTEGER)
    await expect(first.increment('large-counter')).resolves.toBe(Number.MAX_SAFE_INTEGER + 1)
    expect(await second.get('large-counter')).toBe(Number.MAX_SAFE_INTEGER + 1)

    await first.put('fractional-counter', 0.1)
    const expected = 0.1 + 0.2
    await expect(first.increment('fractional-counter', 0.2)).resolves.toBe(expected)
    expect(await second.get('fractional-counter')).toBe(expected)
  })

  it('preserves persistent and expiring counter TTL states and does not store a nonpositive new counter', async () => {
    if (!available) return
    const client = clients[0]!
    await expect(first.increment('new-persistent-counter')).resolves.toBe(1)
    await expect(first.increment('new-persistent-counter')).resolves.toBe(2)
    expect(await client.pttl(`${prefix}new-persistent-counter`)).toBe(-1)

    await first.put('persistent-counter', 1)
    await first.increment('persistent-counter')
    expect(await client.pttl(`${prefix}persistent-counter`)).toBe(-1)

    await first.put('expiring-counter', 1, 5)
    const before = await client.pttl(`${prefix}expiring-counter`)
    await first.increment('expiring-counter')
    const after = await client.pttl(`${prefix}expiring-counter`)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(before)

    await expect(first.increment('zero-counter', 2, 0)).resolves.toBe(2)
    expect(await first.has('zero-counter')).toBe(false)
    await expect(first.increment('past-counter', 3, new Date(0))).resolves.toBe(3)
    expect(await first.has('past-counter')).toBe(false)
  })

  it('does not flush an overlapping delimited namespace', async () => {
    if (!available) return
    const client = clients[0]!
    const namespace = `laravelize:test:${process.pid}:${Date.now()}:tenant:`
    const tenantOne = new RedisCache(client, { prefix: `${namespace}1:` })
    const tenantTen = new RedisCache(client, { prefix: `${namespace}10:` })
    await tenantOne.put('owned', true)
    await tenantTen.put('keep', true)

    await tenantOne.flush()

    expect(await tenantOne.has('owned')).toBe(false)
    expect(await tenantTen.get('keep')).toBe(true)
    await tenantTen.flush()
  })

  it('handles numeric and absolute TTLs and removes on nonpositive expiration', async () => {
    if (!available) return
    await first.put('short', true, new Date(Date.now() + 100))
    await new Promise(resolve => setTimeout(resolve, 130))
    expect(await second.has('short')).toBe(false)
    await first.put('remove', true)
    await first.put('remove', false, 0)
    expect(await first.has('remove')).toBe(false)
  })

  it('protects stale lock release and renewal across adapters', async () => {
    if (!available) return
    const stale = new CacheLock(first, 'lease', 0.08, 'old')
    await stale.acquire()
    await new Promise(resolve => setTimeout(resolve, 100))
    const current = new CacheLock(second, 'lease', 2, 'new')
    expect(await current.acquire()).toBe(true)
    expect(await stale.release()).toBe(false)
    expect(await stale.renew()).toBe(false)
    expect(await current.renew(3)).toBe(true)
    expect(await current.owned()).toBe(true)
  })

  it('fails closed on corrupt data and flushes only its escaped prefix', async () => {
    if (!available) return
    const client = clients[0]!
    await client.set(`${prefix}corrupt`, 'not-an-envelope')
    await expect(first.get('corrupt')).rejects.toBeInstanceOf(CacheCorruptionError)
    const otherPrefix = `laravelize:test:unrelated:${process.pid}:${Date.now()}:`
    await client.set(`${otherPrefix}keep`, 'unrelated')
    await first.put('owned', true)
    await first.flush()
    expect(await client.get(`${otherPrefix}keep`)).toBe('unrelated')
    await client.del(`${otherPrefix}keep`)
  })
})
