import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'
import { describe, expect, it } from 'vitest'
import { BullMQDeadLetterAdapter } from '../../src/runtime/BullMQDeadLetterAdapter.js'
import { MemoryDeadLetterOperationStore } from '@luckys_luis/nuxt-laravelize-dead-letter/testing'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1'
if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

describe.skipIf(!redisUrl)('BullMQDeadLetterAdapter Redis integration', () => {
  it('lists a real failed job privately and safely retries with a reserved operation', async () => {
    const connection = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const name = `dead-letter-${randomUUID()}`
    const prefix = `nuxt-laravelize-test:${randomUUID()}`
    const queue = new Queue(name, { connection, prefix })
    const worker = new Worker(name, async () => {
      throw new Error('token=integration-secret')
    }, { connection, prefix })
    try {
      const job = await queue.add('integration.failure', { private: true }, { attempts: 1, removeOnFail: false })
      for (let attempt = 0; attempt < 100 && await job.getState() !== 'failed'; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
      expect(await job.getState()).toBe('failed')
      await worker.pause()
      const adapter = new BullMQDeadLetterAdapter(queue, new MemoryDeadLetterOperationStore())
      const page = await adapter.list({ limit: 10 })
      expect(page.items).toHaveLength(1)
      expect(page.items[0]).not.toHaveProperty('payload')
      expect((await adapter.get(page.items[0]!.key, { includePayload: true })).payload).toEqual({ private: true })
      const request = { key: page.items[0]!.key, revision: page.items[0]!.revision, operationId: randomUUID(), availableAt: new Date(0).toISOString() }
      const result = await adapter.retry(request)
      expect(await adapter.retry(request)).toEqual(result)
      expect(await job.getState()).toBe('waiting')
    }
    finally {
      await worker.close()
      await queue.close()
      connection.disconnect()
    }
  })
})
