import { randomUUID } from 'node:crypto'
import { Queue as BullQueue } from 'bullmq'
import Redis from 'ioredis'
import { InMemoryJobRegistry, Job, JobRunner, JobSerializer } from '@nuxt-laravelize/queue/runtime'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { describe, expect, it } from 'vitest'
import { BullMQConnection } from '../../src/runtime/BullMQConnection'
import { BullMQQueue } from '../../src/runtime/BullMQQueue'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1'
if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

class DeduplicatedJob extends Job<{ value: number }> {
  readonly payload: { value: number }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { value: number }
  }

  handle(): void {}
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
})
