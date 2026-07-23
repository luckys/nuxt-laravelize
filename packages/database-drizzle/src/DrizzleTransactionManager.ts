import type { AfterCommitHook, TransactionManager, UnitOfWork } from '@nuxt-laravelize/database/runtime'

export interface DrizzleAsyncTransactionSource<Session> {
  transaction<Result>(callback: (session: Session) => Promise<Result>): PromiseLike<Result>
}

export interface DrizzleSyncTransactionSource<Session> {
  transaction<Result>(callback: (session: Session) => Result): Result
}

interface RollbackState { marked: boolean, reason?: unknown }

const rollbackError = (state: RollbackState): Error => state.reason instanceof Error
  ? state.reason
  : new Error('Unit of work was marked rollback-only')

function unitOfWork<Session>(session: Session, hooks: AfterCommitHook[], rollback: RollbackState): UnitOfWork<Session> {
  return {
    session,
    afterCommit(hook) {
      hooks.push(hook)
    },
    markRollbackOnly(reason) {
      if (!rollback.marked) {
        rollback.marked = true
        rollback.reason = reason
      }
    },
  }
}

async function runHooks(hooks: AfterCommitHook[]): Promise<void> {
  for (const hook of hooks)
    await hook()
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? typeof (value as { then?: unknown }).then === 'function'
    : false
}

export class DrizzleTransactionManager<Session> implements TransactionManager<Session> {
  constructor(private readonly database: DrizzleAsyncTransactionSource<Session>) {}

  async transaction<Result>(work: (unitOfWork: UnitOfWork<Session>) => Result | PromiseLike<Result>): Promise<Result> {
    const hooks: AfterCommitHook[] = []
    const rollback: RollbackState = { marked: false }
    const result = await this.database.transaction(async (session) => {
      const value = await work(unitOfWork(session, hooks, rollback))
      if (rollback.marked) throw rollbackError(rollback)
      return value
    })
    await runHooks(hooks)
    return result
  }
}

export class DrizzleSyncTransactionManager<Session> implements TransactionManager<Session> {
  constructor(private readonly database: DrizzleSyncTransactionSource<Session>) {}

  async transaction<Result>(work: (unitOfWork: UnitOfWork<Session>) => Result | PromiseLike<Result>): Promise<Result> {
    const hooks: AfterCommitHook[] = []
    const rollback: RollbackState = { marked: false }
    const result = this.database.transaction((session) => {
      const value = work(unitOfWork(session, hooks, rollback))
      if (isPromiseLike(value))
        throw new TypeError('Synchronous Drizzle transactions do not support Promise-like work')
      if (rollback.marked) throw rollbackError(rollback)
      return value
    })
    await runHooks(hooks)
    return result
  }
}
