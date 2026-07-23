import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { DrizzleSyncTransactionManager, DrizzleTransactionManager, type DrizzleAsyncTransactionSource, type DrizzleSyncTransactionSource } from '../src/index.js'

class AsyncSource<Session> implements DrizzleAsyncTransactionSource<Session> {
  committed = false

  constructor(readonly session: Session) {}

  async transaction<Result>(callback: (session: Session) => Promise<Result>): Promise<Result> {
    const result = await callback(this.session)
    this.committed = true
    return result
  }
}

class SyncSource<Session> implements DrizzleSyncTransactionSource<Session> {
  committed = false

  constructor(readonly session: Session) {}

  transaction<Result>(callback: (session: Session) => Result): Result {
    const result = callback(this.session)
    this.committed = true
    return result
  }
}

describe('DrizzleTransactionManager', () => {
  it('is structurally assignable to an async Drizzle source and passes its exact session', async () => {
    const session = { kind: 'async-transaction' }
    const fake = new AsyncSource(session)
    const source: DrizzleAsyncTransactionSource<typeof session> = fake
    const manager = new DrizzleTransactionManager(source)

    await expect(manager.transaction((unitOfWork) => {
      expect(unitOfWork.session).toBe(session)
      return 42
    })).resolves.toBe(42)
    expect(fake.committed).toBe(true)
  })

  it('runs post-commit hooks in registration order after commit', async () => {
    const events: string[] = []
    const source = new AsyncSource({})
    const manager = new DrizzleTransactionManager(source)

    await manager.transaction((unitOfWork) => {
      unitOfWork.afterCommit(async () => {
        expect(source.committed).toBe(true)
        events.push('first')
      })
      unitOfWork.afterCommit(() => {
        events.push('second')
      })
    })

    expect(events).toEqual(['first', 'second'])
  })

  it('does not run hooks on rollback and rejects hook failures after commit', async () => {
    const rollbackHook = vi.fn()
    const rollbackSource = new AsyncSource({})
    await expect(new DrizzleTransactionManager(rollbackSource).transaction((unitOfWork) => {
      unitOfWork.afterCommit(rollbackHook)
      throw new Error('rollback')
    })).rejects.toThrow('rollback')
    expect(rollbackSource.committed).toBe(false)
    expect(rollbackHook).not.toHaveBeenCalled()

    const committedSource = new AsyncSource({})
    await expect(new DrizzleTransactionManager(committedSource).transaction((unitOfWork) => {
      unitOfWork.afterCommit(() => {
        throw new Error('post-commit failed')
      })
    })).rejects.toThrow('post-commit failed')
    expect(committedSource.committed).toBe(true)
  })

  it('rolls back and skips hooks when rollback-only is caught by outer work', async () => {
    const source = new AsyncSource({})
    const hook = vi.fn()
    const reason = new Error('inner async failure')
    const manager = new DrizzleTransactionManager(source)

    await expect(manager.transaction(async (unitOfWork) => {
      unitOfWork.afterCommit(hook)
      try {
        unitOfWork.markRollbackOnly(reason)
        throw reason
      }
      catch (error) { expect(error).toBe(reason) }
      return 'caught'
    })).rejects.toBe(reason)
    expect(source.committed).toBe(false)
    expect(hook).not.toHaveBeenCalled()
  })
})

describe('DrizzleSyncTransactionManager', () => {
  it('supports strictly synchronous sources and exact sessions', async () => {
    const session = { kind: 'sync-transaction' }
    const fake = new SyncSource(session)
    const source: DrizzleSyncTransactionSource<typeof session> = fake
    const manager = new DrizzleSyncTransactionManager(source)

    await expect(manager.transaction((unitOfWork) => {
      expect(unitOfWork.session).toBe(session)
      return 'result'
    })).resolves.toBe('result')
    expect(fake.committed).toBe(true)
  })

  it('rejects Promise-like work inside the native callback so it cannot commit', async () => {
    const source = new SyncSource({})
    const manager = new DrizzleSyncTransactionManager(source)

    await expect(manager.transaction(async () => 'unsafe')).rejects.toThrow('Synchronous Drizzle transactions do not support Promise-like work')
    expect(source.committed).toBe(false)
  })

  it('has distinct structural source contracts', () => {
    expectTypeOf<DrizzleAsyncTransactionSource<object>>().not.toEqualTypeOf<DrizzleSyncTransactionSource<object>>()
  })

  it('rolls back and skips hooks when rollback-only is caught by outer work', async () => {
    const source = new SyncSource({})
    const hook = vi.fn()
    const manager = new DrizzleSyncTransactionManager(source)

    await expect(manager.transaction((unitOfWork) => {
      unitOfWork.afterCommit(hook)
      unitOfWork.markRollbackOnly('unsafe')
      return 'caught'
    })).rejects.toThrow('Unit of work was marked rollback-only')
    expect(source.committed).toBe(false)
    expect(hook).not.toHaveBeenCalled()
  })
})
