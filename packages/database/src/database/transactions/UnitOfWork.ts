export type AfterCommitHook = () => void | PromiseLike<void>

export interface UnitOfWork<Session> {
  readonly session: Session
  afterCommit(hook: AfterCommitHook): void
  /** Prevents the native transaction from committing, even if its initiating error is caught. */
  markRollbackOnly(reason?: unknown): void
}
