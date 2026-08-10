import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { AfterCommitHook, UnitOfWork } from '@luckys_luis/nuxt-laravelize-database/runtime'
import { DrizzleSyncTransactionManager, DrizzleTransactionManager, type DrizzleAsyncTransactionSource, type DrizzleSyncTransactionSource } from '@luckys_luis/nuxt-laravelize-database-drizzle'
import { Job, type Queue } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'
import { AfterCommitQueueDispatchError, dispatchAfterCommit } from '../src/index'

class ProbeJob extends Job<{ value: string }> {
  readonly payload: { value: string }
  constructor(value: string) {
    super()
    this.payload = { value }
  }

  handle(): void {}
}

class TransactionSource implements DrizzleAsyncTransactionSource<object> {
  committed = false

  async transaction<Result>(callback: (session: object) => Promise<Result>): Promise<Result> {
    const result = await callback({})
    this.committed = true
    return result
  }
}

class SyncTransactionSource implements DrizzleSyncTransactionSource<object> {
  committed = false

  transaction<Result>(callback: (session: object) => Result): Result {
    const result = callback({})
    this.committed = true
    return result
  }
}

describe('dispatchAfterCommit', () => {
  it('registers synchronously and dispatches only after confirmed commit', async () => {
    const source = new TransactionSource()
    const manager = new DrizzleTransactionManager(source)
    const queue = new QueueFake()
    const job = new ProbeJob('one')

    await manager.transaction((unitOfWork) => {
      const result = dispatchAfterCommit(unitOfWork, queue, job)
      expectTypeOf(result).toBeVoid()
      expect(result).toBeUndefined()
      expect(queue.pushed).toHaveLength(0)
    })

    expect(source.committed).toBe(true)
    expect(queue.pushed[0]?.job).toBe(job)
    expect(queue.pushed.map(item => item.job.payload)).toEqual([{ value: 'one' }])
  })

  it('suppresses dispatch on thrown and rollback-only transactions', async () => {
    const queue = new QueueFake()
    const thrown = new DrizzleTransactionManager(new TransactionSource())
    await expect(thrown.transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('thrown'))
      throw new Error('rollback')
    })).rejects.toThrow('rollback')

    const rollbackOnly = new DrizzleTransactionManager(new TransactionSource())
    await expect(rollbackOnly.transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('marked'))
      unitOfWork.markRollbackOnly()
    })).rejects.toThrow('rollback-only')
    expect(queue.pushed).toHaveLength(0)
  })

  it('does not dispatch when native commit rejects after transaction work completes', async () => {
    const queue = new QueueFake()
    const commitError = new Error('commit failed')
    const source: DrizzleAsyncTransactionSource<object> = {
      async transaction(callback) {
        await callback({})
        throw commitError
      },
    }

    await expect(new DrizzleTransactionManager(source).transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('not-committed'))
    })).rejects.toBe(commitError)
    expect(queue.pushed).toHaveLength(0)
  })

  it('preserves registration order and ordinary deduplication semantics', async () => {
    const queue = new QueueFake()
    const manager = new DrizzleTransactionManager(new TransactionSource())

    await manager.transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('first'), { deduplication: { id: 'report-1' } })
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('duplicate'), { deduplication: { id: 'report-1' } })
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('second'))
    })

    expect(queue.pushed.map(item => item.job.payload)).toEqual([{ value: 'first' }, { value: 'second' }])
  })

  it('snapshots mutable option containers when registering', async () => {
    const hooks: AfterCommitHook[] = []
    const unitOfWork: UnitOfWork<object> = { session: {}, afterCommit: hook => hooks.push(hook), markRollbackOnly: vi.fn() }
    const queue = new QueueFake()
    const backoff = [100, 200]
    const deduplication = { id: 'stable' }

    dispatchAfterCommit(unitOfWork, queue, new ProbeJob('stable'), { queue: 'reports', backoff, deduplication })
    backoff[0] = 999
    deduplication.id = 'mutated'
    await hooks[0]!()

    expect(queue.pushed[0]?.options).toMatchObject({ queue: 'reports', backoff: [100, 200], deduplication: { id: 'stable' } })
  })

  it('reports queue rejection as a committed post-commit failure without payload metadata', async () => {
    const cause = new Error('transport acknowledgement lost')
    const queue = { push: vi.fn().mockRejectedValue(cause) } as unknown as Queue
    const source = new TransactionSource()
    const manager = new DrizzleTransactionManager(source)

    const failure = await manager.transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('secret'), { queue: 'tenant-secret', deduplication: { id: 'private-id' } })
    }).catch(error => error)

    expect(source.committed).toBe(true)
    expect(failure).toBeInstanceOf(AfterCommitQueueDispatchError)
    expect(failure).toMatchObject({ committed: true, cause })
    expect(failure.message).toBe('Queue dispatch failed after the database transaction committed')
    expect(failure).not.toHaveProperty('job')
    expect(failure).not.toHaveProperty('options')
    expect(failure).not.toHaveProperty('payload')
    expect(JSON.stringify(failure)).not.toMatch(/secret|private-id/)
  })

  it('can partially admit earlier jobs and skips remaining hooks after failure', async () => {
    const secondError = new Error('second failed')
    const queue = { push: vi.fn()
      .mockResolvedValueOnce({ id: 'first', queue: 'default' })
      .mockRejectedValueOnce(secondError)
      .mockResolvedValueOnce({ id: 'third', queue: 'default' }) } as unknown as Queue
    const manager = new DrizzleTransactionManager(new TransactionSource())

    const failure = await manager.transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('first'))
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('second'))
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('third'))
    }).catch(error => error)

    expect(failure).toMatchObject({ committed: true, cause: secondError })
    expect(queue.push).toHaveBeenCalledTimes(2)
  })

  it('awaits admission and supports synchronous Drizzle transaction sources', async () => {
    let release!: () => void
    const admission = new Promise<void>((resolve) => {
      release = resolve
    })
    const queue = { push: vi.fn(async () => {
      await admission
      return { id: 'job', queue: 'default' }
    }) } as unknown as Queue
    const source = new SyncTransactionSource()
    const transaction = new DrizzleSyncTransactionManager(source).transaction((unitOfWork) => {
      dispatchAfterCommit(unitOfWork, queue, new ProbeJob('sync'))
    })

    let settled = false
    void transaction.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(source.committed).toBe(true)
    expect(settled).toBe(false)
    release()
    await transaction
    expect(settled).toBe(true)
  })
})
