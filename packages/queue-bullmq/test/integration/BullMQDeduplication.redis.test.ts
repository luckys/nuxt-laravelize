import { randomUUID } from 'node:crypto'
import { Queue as BullQueue } from 'bullmq'
import Redis from 'ioredis'
import { InMemoryJobRegistry, Job, JobRunner, JobSerializer } from '@nuxt-laravelize/queue/runtime'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { describe, expect, it, vi } from 'vitest'
import { BullMQConnection } from '../../src/runtime/BullMQConnection'
import { BullMQQueue } from '../../src/runtime/BullMQQueue'
import { BullMQWorker } from '../../src/runtime/BullMQWorker'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1'
if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

class DeduplicatedJob extends Job<{ value: number }> {
  static runs: number[] = []
  readonly payload: { value: number }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { value: number }
  }

  handle(): void { DeduplicatedJob.runs.push(this.payload.value) }
}

describe.skipIf(!redisUrl)('BullMQ deduplication integration', () => {
  it('atomically suppresses concurrent pushes and admits work after ttl expiry', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const connection = new BullMQConnection(redis)
    const queueName = `deduplication-${randomUUID()}`
    const queue = new BullMQQueue(connection, new JobRunner(createContainer(), new InMemoryJobRegistry()), new JobSerializer())
    const inspector = new BullQueue(queueName, { connection: redis })

    try {
      const [first, duplicate] = await Promise.all([
        queue.push(new DeduplicatedJob({ value: 1 }), { queue: queueName, delay: 5_000, deduplication: { id: 'concurrent' } }),
        queue.push(new DeduplicatedJob({ value: 2 }), { queue: queueName, delay: 5_000, deduplication: { id: 'concurrent' } }),
      ])
      expect(duplicate).toEqual(first)
      expect(await inspector.count()).toBe(1)

      const ttlFirst = await queue.push(new DeduplicatedJob({ value: 3 }), { queue: queueName, delay: 5_000, deduplication: { id: 'ttl', ttl: 100 } })
      await new Promise(resolve => setTimeout(resolve, 150))
      const afterExpiry = await queue.push(new DeduplicatedJob({ value: 4 }), { queue: queueName, delay: 5_000, deduplication: { id: 'ttl', ttl: 100 } })
      expect(afterExpiry.id).not.toBe(ttlFirst.id)
      expect(await inspector.count()).toBe(3)
    }
    finally {
      await queue.clear(queueName)
      await queue.close()
      await inspector.close()
      redis.disconnect()
    }
  })

  it('isolates equal queue and deduplication identifiers across prefixes', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const queueName = `deduplication-prefix-${randomUUID()}`
    const firstPrefix = `app-a-${randomUUID()}`
    const secondPrefix = `app-b-${randomUUID()}`
    const registry = new InMemoryJobRegistry()
    registry.register(DeduplicatedJob.name, DeduplicatedJob)
    const runner = new JobRunner(createContainer(), registry)
    const firstConnection = new BullMQConnection(redis, { prefix: firstPrefix })
    const first = new BullMQQueue(firstConnection, runner, new JobSerializer())
    const second = new BullMQQueue(new BullMQConnection(redis, { prefix: secondPrefix }), runner, new JobSerializer())
    const firstWorker = new BullMQWorker(firstConnection, registry, runner)
    const firstInspector = new BullQueue(queueName, { connection: redis, prefix: firstPrefix })
    const secondInspector = new BullQueue(queueName, { connection: redis, prefix: secondPrefix })

    try {
      DeduplicatedJob.runs = []
      await first.push(new DeduplicatedJob({ value: 1 }), { queue: queueName, deduplication: { id: 'shared' } })
      await second.push(new DeduplicatedJob({ value: 2 }), { queue: queueName, deduplication: { id: 'shared' } })

      expect(await firstInspector.count()).toBe(1)
      expect(await secondInspector.count()).toBe(1)
      await firstWorker.work(queueName)
      await vi.waitFor(() => expect(DeduplicatedJob.runs).toEqual([1]), { timeout: 5_000 })
      expect(await secondInspector.count()).toBe(1)
    }
    finally {
      await firstWorker.stop()
      await first.clear(queueName)
      await second.clear(queueName)
      await first.close()
      await second.close()
      await firstInspector.close()
      await secondInspector.close()
      redis.disconnect()
    }
  })
})
