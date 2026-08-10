import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { InMemoryJobRegistry, Job, JobRunner, JobSerializer } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { describe, expect, it, vi } from 'vitest'
import { BullMQConnection } from '../../src/runtime/BullMQConnection'
import { BullMQQueue } from '../../src/runtime/BullMQQueue'
import { BullMQWorker } from '../../src/runtime/BullMQWorker'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1'
if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

class ChainJob extends Job<{ value: number }> {
  static runs: number[] = []
  readonly payload: { value: number }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { value: number }
  }

  handle(): void { ChainJob.runs.push(this.payload.value) }
}

describe.skipIf(!redisUrl)('BullMQ sequential chain integration', () => {
  it('hands each successful step to its configured queue in order', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const connection = new BullMQConnection(redis)
    const firstQueue = `chain-first-${randomUUID()}`
    const secondQueue = `chain-second-${randomUUID()}`
    const registry = new InMemoryJobRegistry()
    registry.register(ChainJob.name, ChainJob)
    const runner = new JobRunner(createContainer(), registry)
    const queue = new BullMQQueue(connection, runner, new JobSerializer())
    const worker = new BullMQWorker(connection, registry, runner)

    try {
      ChainJob.runs = []
      await worker.work(firstQueue)
      await worker.work(secondQueue)
      await queue.chain([
        { job: new ChainJob({ value: 1 }), options: { queue: firstQueue } },
        { job: new ChainJob({ value: 2 }), options: { queue: secondQueue } },
        { job: new ChainJob({ value: 3 }), options: { queue: firstQueue } },
      ])

      await vi.waitFor(() => expect(ChainJob.runs).toEqual([1, 2, 3]), { timeout: 5_000 })
    }
    finally {
      await worker.stop()
      await queue.clear(firstQueue)
      await queue.clear(secondQueue)
      await queue.close()
      redis.disconnect()
    }
  })
})
