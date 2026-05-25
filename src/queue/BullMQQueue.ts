import { Queue as BullQueue } from 'bullmq'

import type { BullMQConnection } from './BullMQConnection'
import type { Job } from './Job'
import type { JobHandle, PushOptions, Queue } from './Queue'

interface ResolvedOptions {
  tries: number
  delay: number
  queue: string
  backoff: number
}

interface JobStaticConfig {
  tries: number
  delay: number
  queue: string
  backoff: number
}

function readStatics(job: Job): JobStaticConfig {
  const ctor = job.constructor as unknown as JobStaticConfig
  return { tries: ctor.tries, delay: ctor.delay, queue: ctor.queue, backoff: ctor.backoff }
}

function resolveOptions(job: Job, options: PushOptions | undefined): ResolvedOptions {
  const statics = readStatics(job)
  return {
    tries: Math.max(options?.tries ?? statics.tries, 1),
    delay: options?.delay ?? statics.delay,
    queue: options?.queue ?? statics.queue,
    backoff: options?.backoff ?? statics.backoff,
  }
}

export class BullMQQueue implements Queue {
  readonly #connection: BullMQConnection
  readonly #queues = new Map<string, BullQueue>()

  constructor(connection: BullMQConnection) {
    this.#connection = connection
  }

  async push(job: Job, options?: PushOptions): Promise<JobHandle> {
    const resolved = resolveOptions(job, options)
    const queue = this.#getOrCreate(resolved.queue)
    const payload = job.serialize()
    const bullJob = await queue.add(payload.name, payload, {
      attempts: resolved.tries,
      delay: resolved.delay,
      backoff: { type: 'fixed', delay: resolved.backoff },
    })
    return { id: String(bullJob.id ?? ''), queue: resolved.queue }
  }

  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle> {
    return this.push(job, { ...options, delay: delayMs })
  }

  async size(queueName?: string): Promise<number> {
    if (queueName !== undefined) {
      const q = this.#getOrCreate(queueName)
      return q.count()
    }
    let total = 0
    for (const q of this.#queues.values()) total += await q.count()
    return total
  }

  async clear(queueName?: string): Promise<void> {
    if (queueName !== undefined) {
      const q = this.#getOrCreate(queueName)
      await q.drain()
      await q.obliterate({ force: true })
      return
    }
    for (const q of this.#queues.values()) {
      await q.drain()
      await q.obliterate({ force: true })
    }
  }

  #getOrCreate(name: string): BullQueue {
    const existing = this.#queues.get(name)
    if (existing) return existing
    const created = new BullQueue(name, { connection: this.#connection.client as never })
    this.#queues.set(name, created)
    return created
  }
}
