import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createTransactionManagerToken, transactionManagerToken, type TransactionManager, type UnitOfWork } from '../../src/public-runtime'

describe('transaction contracts', () => {
  it('exposes an injectable transaction manager token', () => {
    expect(transactionManagerToken).toBeDefined()
    expectTypeOf(createTransactionManagerToken<{ id: string }>('application.transactions'))
      .toMatchTypeOf<{ readonly key: string }>()
  })

  it('models callback-scoped sessions and post-commit hooks', () => {
    expectTypeOf<TransactionManager<{ id: string }>['transaction']>()
      .parameter(0)
      .toEqualTypeOf<(unitOfWork: UnitOfWork<{ id: string }>) => unknown | PromiseLike<unknown>>()

    const hook = vi.fn()
    const unitOfWork = {} as UnitOfWork<{ id: string }>
    expectTypeOf(unitOfWork.session).toEqualTypeOf<{ id: string }>()
    expectTypeOf(unitOfWork.afterCommit).toBeCallableWith(hook)
    expectTypeOf(unitOfWork.markRollbackOnly).toBeCallableWith(new Error('rollback'))
    expectTypeOf(unitOfWork.markRollbackOnly).toBeCallableWith()
  })
})
