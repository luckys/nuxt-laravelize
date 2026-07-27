import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { isDistributedCache, type DistributedCache } from '@nuxt-laravelize/cache/runtime'
import { RedisCache, type RedisCacheClient } from '../../src/index'

function client(overrides: Partial<RedisCacheClient> = {}): RedisCacheClient {
  return {
    get: vi.fn(async () => null),
    exists: vi.fn(async () => 0),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 0),
    scan: vi.fn(async (): Promise<[string, string[]]> => ['0', []]),
    eval: vi.fn(async () => 0),
    ...overrides,
  }
}

describe('RedisCache', () => {
  it('advertises distributed owner-atomic lock operations', () => {
    const cache = new RedisCache(client())

    expect(isDistributedCache(cache)).toBe(true)
    expectTypeOf(cache).toMatchTypeOf<DistributedCache>()
  })
  it.each(['tenant', 'tenant:1'])('rejects a prefix without a trailing colon: %s', (prefix) => {
    expect(() => new RedisCache(client(), { prefix })).toThrow('must end with a colon')
  })

  it.each([0, -1, new Date(0)])('does not mutate an existing value for nonpositive add TTL %s', async (ttl) => {
    const redis = client()
    const cache = new RedisCache(redis)

    await expect(cache.add('existing', 'replacement', ttl)).resolves.toBe(false)
    expect(redis.set).not.toHaveBeenCalled()
    expect(redis.del).not.toHaveBeenCalled()
  })

  it.each([
    new Date(Number.NaN),
    Number.POSITIVE_INFINITY,
    Number.NaN,
    (Number.MAX_SAFE_INTEGER / 1000) + 1,
  ])('rejects an invalid or unsupported TTL %s', async (ttl) => {
    const redis = client()
    await expect(new RedisCache(redis).put('key', true, ttl)).rejects.toThrow(/TTL/)
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('rounds positive fractional TTLs up to a millisecond', async () => {
    const redis = client()
    await new RedisCache(redis).put('key', true, 0.0001)
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'PX', 1)
  })

  it('accepts a positive safe millisecond TTL near the JavaScript boundary', async () => {
    const redis = client()
    await new RedisCache(redis).put('key', true, Number.MAX_SAFE_INTEGER / 1000)
    const milliseconds = vi.mocked(redis.set).mock.calls[0]?.[3]
    expect(milliseconds).toBeGreaterThan(Number.MAX_SAFE_INTEGER - 2)
    expect(Number.isSafeInteger(milliseconds)).toBe(true)
  })

  it('conditionally stores a completed remember factory', async () => {
    const redis = client()
    await expect(new RedisCache(redis).remember('key', 60, async () => 'factory')).resolves.toBe('factory')
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'PX', 60_000, 'NX')
  })

  it('rejects prefix flush for an ioredis Cluster without scanning', async () => {
    const redis = client({ nodes: vi.fn(() => []) })
    await expect(new RedisCache(redis).flush()).rejects.toThrow('unsupported for ioredis Cluster')
    expect(redis.scan).not.toHaveBeenCalled()
  })

  it('distinguishes an omitted counter TTL from an explicit nonpositive TTL', async () => {
    const evalMock = vi.fn(async (_script: string, _numberOfKeys: number, ..._args: Array<string | number>) => 'LZC1:N:1')
    const redis = client({ eval: evalMock })
    await expect(new RedisCache(redis).increment('counter')).resolves.toBe(1)
    const script = String(evalMock.mock.calls[0]?.[0])
    expect(evalMock).toHaveBeenCalledWith(script, 1, expect.any(String), expect.any(String), 1, 0, 0)
    await new RedisCache(redis).increment('expiring-counter', 1, 0)
    expect(evalMock).toHaveBeenLastCalledWith(script, 1, expect.any(String), expect.any(String), 1, 1, 0)
    expect(script).toContain('raw and ttl==-1')
    expect(script).toContain('raw and ttl>0')
    expect(script).toContain('if ttl==-1 or ttl>0')
    expect(script).toContain('ARGV[3]==\'0\'')
    expect(script).not.toContain('if raw then redis.call(\'SET\',KEYS[1],encoded)')
  })
})
