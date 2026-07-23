import { describe, expect, it, vi } from 'vitest'

import { InMemoryCache } from '../../src/runtime/InMemoryCache'

describe('InMemoryCache', () => {
  it('stores permanent and expiring values', async () => {
    let now = 1_000
    const cache = new InMemoryCache(() => now)
    await cache.forever('permanent', 'value')
    await cache.put('temporary', 'value', 10)

    expect(await cache.get('permanent')).toBe('value')
    expect(await cache.get('temporary')).toBe('value')
    now += 10_000
    expect(await cache.get('temporary')).toBeUndefined()
    expect(await cache.get('permanent')).toBe('value')
  })

  it('supports add, pull, forget and flush', async () => {
    const cache = new InMemoryCache()
    await expect(cache.add('key', 'first')).resolves.toBe(true)
    await expect(cache.add('key', 'second')).resolves.toBe(false)
    await expect(cache.pull('key')).resolves.toBe('first')
    await expect(cache.has('key')).resolves.toBe(false)
    await cache.put('a', 1)
    await cache.put('b', 2)
    await cache.flush()
    await expect(cache.has('a')).resolves.toBe(false)
  })

  it('returns a pulled value to only one concurrent caller', async () => {
    const cache = new InMemoryCache()
    await cache.put('token', 'one-time')

    await expect(Promise.all([
      cache.pull('token'),
      cache.pull('token'),
    ])).resolves.toEqual(['one-time', undefined])
  })

  it('forgets only a matching value atomically', async () => {
    const cache = new InMemoryCache()
    await cache.put('lock', 'owner-a')

    await expect(cache.forgetIf('lock', 'owner-b')).resolves.toBe(false)
    await expect(cache.get('lock')).resolves.toBe('owner-a')
    await expect(cache.forgetIf('lock', 'owner-a')).resolves.toBe(true)
    await expect(cache.has('lock')).resolves.toBe(false)
  })

  it('expires only a matching value and removes on nonpositive expiration', async () => {
    let now = 1_000
    const cache = new InMemoryCache(() => now)
    await cache.put('lock', 'owner-a')
    await expect(cache.expireIf('lock', 'owner-b', 10)).resolves.toBe(false)
    await expect(cache.expireIf('lock', 'owner-a', 1)).resolves.toBe(true)
    now = 2_000
    await expect(cache.has('lock')).resolves.toBe(false)
    await cache.put('lock', 'owner-a')
    await expect(cache.expireIf('lock', 'owner-a', 0)).resolves.toBe(true)
    await expect(cache.has('lock')).resolves.toBe(false)
  })

  it('allows only one concurrent add for a missing key', async () => {
    const cache = new InMemoryCache()

    await expect(Promise.all([
      cache.add('lock', 'first'),
      cache.add('lock', 'second'),
    ])).resolves.toEqual([true, false])
    await expect(cache.get('lock')).resolves.toBe('first')
  })

  it('coalesces concurrent remember callbacks', async () => {
    const cache = new InMemoryCache()
    const factory = vi.fn(async () => 'loaded')

    await expect(Promise.all([
      cache.remember('key', 60, factory),
      cache.remember('key', 60, factory),
    ])).resolves.toEqual(['loaded', 'loaded'])
    expect(factory).toHaveBeenCalledOnce()
  })

  it('does not let pending remember overwrite newer writes or a flush', async () => {
    const cache = new InMemoryCache()
    let resolveFirst!: (value: string) => void
    const first = cache.remember('key', 60, () => new Promise<string>((resolve) => {
      resolveFirst = resolve
    }))
    await Promise.resolve()
    await cache.put('key', 'newer')
    resolveFirst('stale')

    await expect(first).resolves.toBe('stale')
    await expect(cache.get('key')).resolves.toBe('newer')

    let resolveSecond!: (value: string) => void
    const second = cache.remember('other', 60, () => new Promise<string>((resolve) => {
      resolveSecond = resolve
    }))
    await Promise.resolve()
    await cache.flush()
    resolveSecond('stale')
    await second
    await expect(cache.has('other')).resolves.toBe(false)
  })

  it('cleans up a rejected remember factory for a later retry', async () => {
    const cache = new InMemoryCache()
    await expect(cache.remember('key', 60, async () => {
      throw new Error('failed')
    })).rejects.toThrow('failed')
    await expect(cache.remember('key', 60, async () => 'recovered')).resolves.toBe('recovered')
  })

  it('supports atomic counters while preserving their initial TTL', async () => {
    let now = 1_000
    const cache = new InMemoryCache(() => now)
    await expect(cache.increment('attempts', 2, 10)).resolves.toBe(2)
    now += 5_000
    await expect(cache.increment('attempts')).resolves.toBe(3)
    await expect(cache.decrement('attempts')).resolves.toBe(2)
    now += 5_000
    await expect(cache.get('attempts')).resolves.toBeUndefined()
  })

  it('opportunistically sweeps untouched expired entries', async () => {
    let now = 1_000
    const cache = new InMemoryCache(() => now)
    await cache.put('expired', 'value', 1)
    now += 1_000
    for (let index = 0; index < 63; index += 1) await cache.put(`active:${index}`, index)

    await expect(cache.forget('expired')).resolves.toBe(false)
  })

  it('rejects invalid keys, values and non-numeric counters', async () => {
    const cache = new InMemoryCache()
    await expect(cache.put('', 'value')).rejects.toThrow('Cache key cannot be empty')
    await expect(cache.put('key', undefined)).rejects.toThrow('Cache cannot store undefined')
    await cache.put('key', 'value')
    await expect(cache.increment('key')).rejects.toThrow('is not numeric')
    await cache.put('counter', Number.POSITIVE_INFINITY)
    await expect(cache.increment('counter')).rejects.toThrow('is not numeric')
  })
})
