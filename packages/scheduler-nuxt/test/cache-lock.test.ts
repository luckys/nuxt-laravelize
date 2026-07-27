import { InMemoryCache } from '@nuxt-laravelize/cache/runtime'
import { RedisCache, type RedisCacheClient } from '@nuxt-laravelize/cache-redis'
import { defineSchedule, type ScheduledTask } from '@nuxt-laravelize/scheduler'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CacheLockSchedulerLockProvider } from '../src/cache-lock'
import { createSchedulerRunner, SchedulerLockLostError } from '../src/runtime'

const taskFrom = (declare: Parameters<typeof defineSchedule>[0]): ScheduledTask => defineSchedule(declare).all()[0]!

function redisClient(renew = true): RedisCacheClient {
  let value: string | null = null
  return {
    get: vi.fn(async () => value),
    exists: vi.fn(async () => Number(value !== null)),
    set: vi.fn(async (_key: string, next: string, mode?: 'NX' | 'PX', _milliseconds?: number, condition?: 'NX') => {
      if ((mode === 'NX' || condition === 'NX') && value !== null) return null
      value = next
      return 'OK'
    }) as RedisCacheClient['set'],
    del: vi.fn(async () => {
      const removed = Number(value !== null)
      value = null
      return removed
    }),
    scan: vi.fn(async (): Promise<[string, string[]]> => ['0', []]),
    eval: vi.fn(async (script: string, _keys: number, _key: string, expected: string) => {
      if (value !== expected) return 0
      if (script.includes('PEXPIRE')) return Number(renew)
      value = null
      return 1
    }),
  }
}

describe('CacheLockSchedulerLockProvider', () => {
  afterEach(() => vi.useRealTimers())

  it('accepts Redis distributed capability and rejects process-local caches', async () => {
    const redis = new RedisCache(redisClient())
    const provider = new CacheLockSchedulerLockProvider(redis)
    const execute = vi.fn(async () => 'done')
    const task = taskFrom(schedule => schedule.task('singleton').hourly().onOneServer())

    await expect(createSchedulerRunner({ operations: { singleton: { execute } }, locks: provider }).run(task)).resolves.toEqual({ status: 'completed', result: 'done' })
    expect(() => new CacheLockSchedulerLockProvider(new InMemoryCache() as never)).toThrow(/distributed owner-atomic cache/)
    await expect(provider.acquire('too-short', 0.001)).rejects.toThrow(/timer range/)
  })

  it('releases with an owner comparison rather than unconditional deletion', async () => {
    const client = redisClient()
    const provider = new CacheLockSchedulerLockProvider(new RedisCache(client))
    const lease = await provider.acquire('owner-safe', 60)

    await lease?.release()

    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call(\'GET\',KEYS[1])==ARGV[1]'), 1, expect.any(String), expect.any(String))
    expect(client.del).not.toHaveBeenCalled()
  })

  it('renews long executions and fails instead of reporting completion after ownership loss', async () => {
    vi.useFakeTimers()
    const healthyClient = redisClient()
    const healthyLease = await new CacheLockSchedulerLockProvider(new RedisCache(healthyClient)).acquire('scheduler:slow', 0.1)

    await vi.advanceTimersByTimeAsync(50)
    await expect(healthyLease?.assertOwned?.()).resolves.toBeUndefined()
    expect(healthyClient.eval).toHaveBeenCalledWith(expect.stringContaining('PEXPIRE'), 1, expect.any(String), expect.any(String), 100)
    await healthyLease?.release()

    const lostLease = await new CacheLockSchedulerLockProvider(new RedisCache(redisClient(false))).acquire('scheduler:lost', 0.1)
    await vi.advanceTimersByTimeAsync(50)
    await expect(lostLease?.assertOwned?.()).rejects.toBeInstanceOf(SchedulerLockLostError)
    await expect(lostLease?.release()).rejects.toBeInstanceOf(SchedulerLockLostError)

    const ownershipLost = new SchedulerLockLostError('lost')
    const runner = createSchedulerRunner({
      operations: { slow: { execute: async () => 'must-not-complete' } },
      locks: { capabilities: { distributed: true }, acquire: async () => ({ release: vi.fn(), assertOwned: async () => { throw ownershipLost } }) },
    })
    const task = taskFrom(schedule => schedule.task('slow').hourly().onOneServer())
    await expect(runner.run(task)).rejects.toBe(ownershipLost)
  })

  it('fails release when the owner-atomic deletion no longer owns the lock', async () => {
    const client = redisClient()
    vi.mocked(client.eval).mockImplementation(async script => script.includes('PEXPIRE') ? 1 : 0)
    const lease = await new CacheLockSchedulerLockProvider(new RedisCache(client)).acquire('scheduler:expired', 60)

    await expect(lease?.release()).rejects.toBeInstanceOf(SchedulerLockLostError)
  })

  it('fails release when an in-flight renewal loses ownership', async () => {
    vi.useFakeTimers()
    const client = redisClient()
    let signalRenewalStarted!: () => void
    let resolveRenewal!: (value: number) => void
    const renewalStarted = new Promise<void>((resolve) => {
      signalRenewalStarted = resolve
    })
    const renewalResult = new Promise<number>((resolve) => {
      resolveRenewal = resolve
    })
    vi.mocked(client.eval).mockImplementation(async (script) => {
      if (!script.includes('PEXPIRE')) return 1
      signalRenewalStarted()
      return renewalResult
    })
    const lease = await new CacheLockSchedulerLockProvider(new RedisCache(client)).acquire('scheduler:renewal-race', 0.1)

    const timerAdvance = vi.advanceTimersByTimeAsync(50)
    await renewalStarted
    const releaseExpectation = expect(lease?.release()).rejects.toBeInstanceOf(SchedulerLockLostError)
    resolveRenewal(0)
    await timerAdvance
    await releaseExpectation
  })
})
