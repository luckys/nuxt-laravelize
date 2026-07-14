import { Worker, type Job as BullJob } from 'bullmq'
import type { InMemoryJobRegistry, JobRunner, SerializedJob } from '@nuxt-laravelize/queue/runtime'
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
    const worker = new Worker(queue, async job => this.runner.run(job.data as SerializedJob), {
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
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return
    const serialized = job.data as SerializedJob
    await this.runner.failed(serialized, error)
    await this.failures.report({ job: this.registry.rehydrate(serialized), queue, error, attempts: job.attemptsMade })
  }
}
