import type { UnitOfWork } from './UnitOfWork'

export interface TransactionManager<Session> {
  transaction<Result>(work: (unitOfWork: UnitOfWork<Session>) => Result | PromiseLike<Result>): Promise<Result>
}
