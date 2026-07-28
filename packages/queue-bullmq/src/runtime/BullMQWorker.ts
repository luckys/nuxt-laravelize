import { UnrecoverableError, Worker, type Job as BullJob } from 'bullmq'
import { isNonRetryableJobError, type InMemoryJobRegistry, type JobRunner, type SerializedJob } from '@nuxt-laravelize/queue/runtime'
import type { BullMQConnection } from './BullMQConnection'
import { FailureReporter } from './FailureReporter'

export class BullMQWorker {
  readonly #workers: Worker[] = []
  constructor(
    private readonly connection: BullMQConnection,
    private readonly registry: InMemoryJobRegistry,
    private readonly runner: JobRunner,
    private readonly failures: FailureReporter = new FailureReporter(),
  ) {}

  async work(queue = 'default', concurrency = 1): Promise<void> {
    const worker = new Worker(queue, async (job) => {
      try {
        await this.runner.run(job.data as SerializedJob, { queue, attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts ?? 1 })
      }
      catch (error) {
        throw toBullMQJobError(error)
      }
    }, {
      connection: this.connection.client,
      concurrency,
    })
    worker.on('failed', (job, error) => {
      void this.#reportTerminalFailure(job, error, queue)
    })
    this.#workers.push(worker)
  }

  async stop(): Promise<void> {
    await Promise.all(this.#workers.map(worker => worker.close()))
    this.#workers.length = 0
  }

  async #reportTerminalFailure(job: BullJob | undefined, error: Error, queue: string): Promise<void> {
    if (!job || !isTerminalBullMQFailure(job, error)) return
    const serialized = job.data as SerializedJob
    try {
      await this.runner.failed(serialized, error, { queue, attempt: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 })
    }
    catch {
      // Preserve the worker's original failure.
    }
    try {
      await this.failures.report({ job: this.registry.rehydrate(serialized), queue, error, attempts: job.attemptsMade })
    }
    catch {
      // Failure observers must not reject an event-emitter callback.
    }
  }
}

export function toBullMQJobError(error: unknown): unknown {
  return isNonRetryableJobError(error) ? new UnrecoverableError(`[${error.code}] Non-retryable job failure`) : error
}

export function isTerminalBullMQFailure(job: Pick<BullJob, 'attemptsMade' | 'opts'>, error: Error): boolean {
  return error instanceof UnrecoverableError || error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1)
}
