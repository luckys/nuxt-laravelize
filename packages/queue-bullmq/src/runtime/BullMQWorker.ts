import { DelayedError, UnrecoverableError, Worker, type Job as BullJob } from 'bullmq'
import { isJobReleasedError, isNonRetryableJobError, NonRetryableJobError, type InMemoryJobRegistry, type JobRunner, type SerializedJob } from '@nuxt-laravelize/queue/runtime'
import type { BullMQConnection } from './BullMQConnection'
import type { FailureReporter } from './FailureReporter'

export class BullMQWorker {
  readonly #workers = new Set<Worker>()
  readonly #terminalReports = new Set<Promise<void>>()
  #stopping?: Promise<void>
  constructor(
    private readonly connection: BullMQConnection,
    private readonly registry: InMemoryJobRegistry,
    private readonly runner: JobRunner,
    private readonly failures: FailureReporter = connection.failures,
  ) {}

  async work(queue = 'default', concurrency = 1): Promise<void> {
    if (this.#stopping) throw new Error('BullMQ worker is stopping and cannot accept new queues')
    const worker = new Worker(queue, async (job, token) => {
      await processBullMQJob(this.runner, job, queue, token)
    }, {
      connection: this.connection.client,
      concurrency,
    })
    worker.on('failed', (job, error) => {
      const report = this.#reportTerminalFailure(job, error, queue)
      this.#terminalReports.add(report)
      void report.then(() => this.#terminalReports.delete(report), () => this.#terminalReports.delete(report))
    })
    this.#workers.add(worker)
  }

  stop(): Promise<void> {
    this.#stopping ??= this.#drain()
    return this.#stopping
  }

  async #drain(): Promise<void> {
    const workers = [...this.#workers]
    const results = await Promise.allSettled(workers.map(worker => worker.close()))
    for (const worker of workers) this.#workers.delete(worker)
    await Promise.resolve()
    while (this.#terminalReports.size > 0) await Promise.all([...this.#terminalReports])
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (errors.length > 0) throw new AggregateError(errors, 'One or more BullMQ workers failed to drain')
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

export async function processBullMQJob(runner: JobRunner, job: BullJob, queue: string, token?: string, now: () => number = Date.now): Promise<void> {
  try {
    await runner.run(job.data as SerializedJob, { queue, attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts ?? 1 })
  }
  catch (error) {
    if (isJobReleasedError(error)) {
      const state = job as BullJob & { attemptsStarted?: number, stalledCounter?: number }
      const attemptsStarted = state.attemptsStarted ?? job.attemptsMade + 1
      const releases = Math.max(0, attemptsStarted - job.attemptsMade - (state.stalledCounter ?? 0) - 1)
      if (releases >= error.maxReleases) throw toBullMQJobError(new NonRetryableJobError('JOB_RELEASE_LIMIT_EXCEEDED', 'Job exceeded its delayed release budget'))
      await job.moveToDelayed(now() + error.delay, token)
      throw new DelayedError()
    }
    throw toBullMQJobError(error)
  }
}

export function toBullMQJobError(error: unknown): unknown {
  return isNonRetryableJobError(error) ? new UnrecoverableError(`[${error.code}] Non-retryable job failure`) : error
}

export function isTerminalBullMQFailure(job: Pick<BullJob, 'attemptsMade' | 'opts'>, error: Error): boolean {
  return error.name !== 'DelayedError' && (error instanceof UnrecoverableError || error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1))
}
