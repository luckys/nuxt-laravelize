import type { AfterCommitHook, TransactionManager, UnitOfWork } from '@nuxt-laravelize/database/runtime'

export interface DrizzleAsyncTransactionSource<Session> {
  transaction<Result>(callback: (session: Session) => Promise<Result>): PromiseLike<Result>
}

export interface DrizzleSyncTransactionSource<Session> {
  transaction<Result>(callback: (session: Session) => Result): Result
}

function unitOfWork<Session>(session: Session, hooks: AfterCommitHook[]): UnitOfWork<Session> {
  return {
    session,
    afterCommit(hook) {
      hooks.push(hook)
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
    const result = await this.database.transaction(async session => await work(unitOfWork(session, hooks)))
    await runHooks(hooks)
    return result
  }
}

export class DrizzleSyncTransactionManager<Session> implements TransactionManager<Session> {
  constructor(private readonly database: DrizzleSyncTransactionSource<Session>) {}

  async transaction<Result>(work: (unitOfWork: UnitOfWork<Session>) => Result | PromiseLike<Result>): Promise<Result> {
    const hooks: AfterCommitHook[] = []
    const result = this.database.transaction((session) => {
      const value = work(unitOfWork(session, hooks))
      if (isPromiseLike(value))
        throw new TypeError('Synchronous Drizzle transactions do not support Promise-like work')
      return value
    })
    await runHooks(hooks)
    return result
  }
}
