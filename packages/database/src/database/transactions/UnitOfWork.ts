export type AfterCommitHook = () => void | PromiseLike<void>

export interface UnitOfWork<Session> {
  readonly session: Session
  afterCommit(hook: AfterCommitHook): void
}
