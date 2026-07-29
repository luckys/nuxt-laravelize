import { InMemoryCache } from '@nuxt-laravelize/cache/runtime'
import { describe, expect, it } from 'vitest'

import { RateLimiter } from '../../src/runtime/RateLimiter'

describe('RateLimiter', () => {
  it('allows attempts up to the limit and reports retry metadata', async () => {
    let now = 1_000
    const limiter = new RateLimiter(new InMemoryCache(() => now), () => now)

    await expect(limiter.hit('login:user', 2, 10)).resolves.toMatchObject({
      allowed: true,
      attempts: 1,
      remaining: 1,
      retryAfter: 10,
      retryAfterMilliseconds: 10_000,
    })
    now += 2_000
    await expect(limiter.hit('login:user', 2, 10)).resolves.toMatchObject({ allowed: true, attempts: 2, remaining: 0, retryAfter: 8, retryAfterMilliseconds: 8_000 })
    await expect(limiter.hit('login:user', 2, 10)).resolves.toMatchObject({ allowed: false, attempts: 3, remaining: 0, retryAfter: 8, retryAfterMilliseconds: 8_000 })
  })

  it('starts a fresh window after expiration', async () => {
    let now = 1_000
    const limiter = new RateLimiter(new InMemoryCache(() => now), () => now)
    await limiter.hit('api:user', 1, 5)
    now += 5_000

    await expect(limiter.hit('api:user', 1, 5)).resolves.toMatchObject({ allowed: true, attempts: 1, retryAfter: 5 })
  })

  it('does not reuse a counter that outlives its previous timer', async () => {
    let now = 1_000
    const cache = new InMemoryCache(() => now)
    const limiter = new RateLimiter(cache, () => now)
    await limiter.hit('api:user', 1, 5)
    await cache.put('laravelize:rate-limit:api:user:6000:attempts', 10, 60)
    now += 5_000

    await expect(limiter.hit('api:user', 1, 5)).resolves.toMatchObject({ allowed: true, attempts: 1 })
  })

  it('consumes concurrent attempts atomically', async () => {
    const limiter = new RateLimiter(new InMemoryCache(), Date.now, 'laravelize:rate-limit:', true)
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.hit('api:shared', 5, 60)))

    expect(results.filter(result => result.allowed)).toHaveLength(5)
    expect(results.map(result => result.attempts).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('preserves the legacy key scheme unless atomic windows are explicitly enabled', async () => {
    const cache = new InMemoryCache(() => 1_000)
    const limiter = new RateLimiter(cache, () => 1_000)

    await limiter.hit('existing:user', 2, 60)

    await expect(cache.has('laravelize:rate-limit:existing:user:timer')).resolves.toBe(true)
    await expect(cache.has('laravelize:rate-limit:existing:user:window')).resolves.toBe(false)
  })

  it('reports attempts, remaining capacity and supports clearing a key', async () => {
    const limiter = new RateLimiter(new InMemoryCache())
    await limiter.hit('login:user', 3)
    await expect(limiter.attempts('login:user')).resolves.toBe(1)
    await expect(limiter.remaining('login:user', 3)).resolves.toBe(2)
    await limiter.clear('login:user')
    await expect(limiter.attempts('login:user')).resolves.toBe(0)
  })

  it('rejects invalid limits', async () => {
    const limiter = new RateLimiter(new InMemoryCache())
    await expect(limiter.hit('', 1)).rejects.toThrow('key cannot be empty')
    await expect(limiter.hit('key', 0)).rejects.toThrow('positive integer')
    await expect(limiter.hit('key', 1, Number.POSITIVE_INFINITY)).rejects.toThrow('positive finite')
  })
})
