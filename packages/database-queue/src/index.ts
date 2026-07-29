import type { UnitOfWork } from '@nuxt-laravelize/database/runtime'
import type { Job, PushOptions, Queue } from '@nuxt-laravelize/queue/runtime'

export class AfterCommitQueueDispatchError extends Error {
  readonly committed = true

  constructor(cause: unknown) {
    super('Queue dispatch failed after the database transaction committed', { cause })
    this.name = 'AfterCommitQueueDispatchError'
  }
}

export function dispatchAfterCommit<Session>(
  unitOfWork: UnitOfWork<Session>,
  queue: Queue,
  job: Job,
  options: PushOptions = {},
): void {
  const snapshot = snapshotOptions(options)
  unitOfWork.afterCommit(async () => {
    try {
      await queue.push(job, snapshot)
    }
    catch (cause) {
      throw new AfterCommitQueueDispatchError(cause)
    }
  })
}

function snapshotOptions(options: PushOptions): PushOptions {
  return {
    ...options,
    ...(Array.isArray(options.backoff) ? { backoff: [...options.backoff] } : {}),
    ...(options.deduplication === undefined ? {} : { deduplication: { ...options.deduplication } }),
  }
}
