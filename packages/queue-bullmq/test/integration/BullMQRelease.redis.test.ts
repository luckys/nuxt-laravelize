import { randomUUID } from 'node:crypto'
import { Queue as BullQueue } from 'bullmq'
import Redis from 'ioredis'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, Job, JobReleasedError, JobRunner, JobSerializer } from '@nuxt-laravelize/queue/runtime'
import { describe, expect, it, vi } from 'vitest'
import { BullMQConnection } from '../../src/runtime/BullMQConnection'
import { BullMQQueue } from '../../src/runtime/BullMQQueue'
import { BullMQWorker } from '../../src/runtime/BullMQWorker'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1'
if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

class ReleasedJob extends Job {
  static executions = 0
  readonly payload = {}
  handle(): void { ReleasedJob.executions += 1 }
}

describe.skipIf(!redisUrl)('BullMQ delayed release integration', () => {
  it('replays a released job without exhausting a one-attempt budget', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const connection = new BullMQConnection(redis)
    const queueName = `release-${randomUUID()}`
    const registry = new InMemoryJobRegistry()
    registry.register(ReleasedJob.name, ReleasedJob)
    const runner = new JobRunner(createContainer(), registry)
    let release = true
    runner.use('release-once', async (_job, _scope, next) => {
      if (release) {
        release = false
        throw new JobReleasedError(200)
      }
      await next()
    })
    const queue = new BullMQQueue(connection, runner, new JobSerializer())
    const worker = new BullMQWorker(connection, registry, runner)
    const failures = vi.fn()
    queue.onFailed(failures)
    const inspector = new BullQueue(queueName, { connection: redis })

    try {
      ReleasedJob.executions = 0
      await worker.work(queueName)
      const handle = await queue.push(new ReleasedJob(), { queue: queueName, tries: 1, deduplication: { id: 'released-job' } })
      const job = await inspector.getJob(handle.id)
      await vi.waitFor(async () => expect(await job?.getState()).toBe('delayed'), { timeout: 5000 })
      const duplicate = await queue.push(new ReleasedJob(), { queue: queueName, tries: 1, deduplication: { id: 'released-job' } })
      expect(duplicate).toEqual(handle)
      await vi.waitFor(async () => expect(await job?.getState()).toBe('completed'), { timeout: 5000 })
      expect(ReleasedJob.executions).toBe(1)
      expect((await inspector.getJob(handle.id))?.attemptsMade).toBe(1)
      const afterCompletion = await queue.push(new ReleasedJob(), { queue: queueName, tries: 1, deduplication: { id: 'released-job' } })
      expect(afterCompletion.id).not.toBe(handle.id)
      await vi.waitFor(() => expect(ReleasedJob.executions).toBe(2), { timeout: 5000 })
      expect(failures).not.toHaveBeenCalled()
    }
    finally {
      await worker.stop()
      await queue.clear(queueName)
      await queue.close()
      await inspector.close()
      redis.disconnect()
    }
  })
})
