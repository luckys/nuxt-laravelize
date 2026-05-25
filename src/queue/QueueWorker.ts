import { Worker } from 'bullmq'

import type { Resolver } from '../core/container/Container'

import type { BullMQConnection } from './BullMQConnection'
import type { JobRegistry } from './JobRegistry'
import { ListenerJob } from './ListenerJob'

export class QueueWorker {
  readonly #connection: BullMQConnection
  readonly #registry: JobRegistry
  readonly #resolver: Resolver
  readonly #activeWorkers: Worker[] = []

  constructor(connection: BullMQConnection, registry: JobRegistry, resolver: Resolver) {
    this.#connection = connection
    this.#registry = registry
    this.#resolver = resolver
  }

  async work(queueName: string = 'default', concurrency: number = 1): Promise<void> {
    const handler = async (job: { data: { name: string, args: readonly unknown[] } }): Promise<void> => {
      const instance = this.#registry.rehydrateJob(job.data)
      if (instance instanceof ListenerJob) {
        await instance.handle(this.#resolver, this.#registry)
        return
      }
      await instance.handle()
    }

    const worker = new Worker(queueName, handler as never, {
      connection: this.#connection.client as never,
      concurrency,
    })

    worker.on('failed', (job, error) => {
      console.error(`[laravelize.queue] job ${job?.id ?? 'unknown'} failed`, error)
    })

    this.#activeWorkers.push(worker)
  }

  async stop(): Promise<void> {
    await Promise.all(this.#activeWorkers.map(w => w.close()))
    this.#activeWorkers.length = 0
  }
}
