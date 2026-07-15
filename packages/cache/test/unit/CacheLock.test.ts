import { describe, expect, it, vi } from 'vitest'

import { CacheLock, LockTimeoutError } from '../../src/runtime/CacheLock'
import { InMemoryCache } from '../../src/runtime/InMemoryCache'

describe('CacheLock', () => {
  it('allows only one owner and protects release by ownership', async () => {
    const cache = new InMemoryCache()
    const first = new CacheLock(cache, 'report', 60, 'owner-a')
    const second = new CacheLock(cache, 'report', 60, 'owner-b')

    await expect(first.acquire()).resolves.toBe(true)
    await expect(second.acquire()).resolves.toBe(false)
    await expect(second.release()).resolves.toBe(false)
    await expect(first.owned()).resolves.toBe(true)
    await expect(first.release()).resolves.toBe(true)
    await expect(second.acquire()).resolves.toBe(true)
  })

  it('can restore ownership in another process', async () => {
    const cache = new InMemoryCache()
    const original = new CacheLock(cache, 'report', 60, 'transfer-token')
    await original.acquire()
    const restored = new CacheLock(cache, 'report', 60, original.owner)

    await expect(restored.owned()).resolves.toBe(true)
    await expect(restored.release()).resolves.toBe(true)
  })

  it('releases after callbacks resolve or reject', async () => {
    const cache = new InMemoryCache()
    const lock = new CacheLock(cache, 'report', 60, 'owner')
    await expect(lock.run(async () => 'complete')).resolves.toBe('complete')
    await expect(lock.owned()).resolves.toBe(false)
    await expect(lock.run(async () => {
      throw new Error('failed')
    })).rejects.toThrow('failed')
    await expect(lock.owned()).resolves.toBe(false)
  })

  it('waits for a lock and times out deterministically', async () => {
    let now = 0
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds
    })
    const cache = new InMemoryCache(() => now)
    const holder = new CacheLock(cache, 'report', 10, 'holder', () => now, sleep)
    const waiter = new CacheLock(cache, 'report', 10, 'waiter', () => now, sleep)
    await holder.acquire()

    await expect(waiter.block(1, async () => undefined, 250)).rejects.toBeInstanceOf(LockTimeoutError)
    expect(sleep).toHaveBeenCalledTimes(4)
  })

  it('acquires after an existing lock expires while blocking', async () => {
    let now = 0
    const cache = new InMemoryCache(() => now)
    const sleep = async (milliseconds: number) => {
      now += milliseconds
    }
    await new CacheLock(cache, 'report', 1, 'holder', () => now, sleep).acquire()
    const waiter = new CacheLock(cache, 'report', 10, 'waiter', () => now, sleep)

    await expect(waiter.block(2, async () => 'complete', 250)).resolves.toBe('complete')
    await expect(waiter.owned()).resolves.toBe(false)
  })
})
