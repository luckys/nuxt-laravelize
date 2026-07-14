import { Queue as BullQueue } from 'bullmq'
import type { Job, JobHandle, PushOptions, Queue, JobRunner } from '@nuxt-laravelize/queue/runtime'
import type { BullMQConnection } from './BullMQConnection'
import { FailureReporter } from './FailureReporter'

export class BullMQQueue implements Queue {
  readonly #queues = new Map<string, BullQueue>()
  constructor(
    private readonly connection: BullMQConnection,
    private readonly runner: JobRunner,
    private readonly failures: FailureReporter = new FailureReporter(),
  ) {}

  async push(job: Job, options: PushOptions = {}): Promise<JobHandle> {
    const config = job.constructor as typeof Job
    const queueName = options.queue ?? config.queue
    const queued = await this.#queue(queueName).add(job.constructor.name, job.serialize(), {
      attempts: Math.max(options.tries ?? config.tries, 1),
      delay: Math.max(options.delay ?? config.delay, 0),
      backoff: { type: 'fixed', delay: readBackoff(options.backoff ?? config.backoff) },
    })
    return { id: String(queued.id ?? ''), queue: queueName }
  }

  later(delay: number, job: Job, options: PushOptions = {}): Promise<JobHandle> { return this.push(job, { ...options, delay }) }
  sync(job: Job): Promise<void> { return this.runner.run(job.serialize()) }
  onFailed(callback: Parameters<FailureReporter['listen']>[0]): void { this.failures.listen(callback) }
  async size(queue?: string): Promise<number> {
    if (queue) return this.#queue(queue).count()
    let count = 0
    for (const item of this.#queues.values()) count += await item.count()
    return count
  }

  async clear(queue?: string): Promise<void> {
    const queues = queue ? [this.#queue(queue)] : [...this.#queues.values()]
    await Promise.all(queues.map(async (item) => {
      await item.drain()
      await item.obliterate({ force: true })
    }))
  }

  async close(): Promise<void> { await Promise.all([...this.#queues.values()].map(queue => queue.close())) }
  #queue(name: string): BullQueue {
    const existing = this.#queues.get(name)
    if (existing) return existing
    const queue = new BullQueue(name, { connection: this.connection.client })
    this.#queues.set(name, queue)
    return queue
  }
}

function readBackoff(backoff: number | readonly number[]): number {
  return typeof backoff === 'number' ? Math.max(backoff, 0) : Math.max(backoff[0] ?? 0, 0)
}
