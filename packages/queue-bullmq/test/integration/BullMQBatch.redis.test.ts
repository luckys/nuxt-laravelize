/* eslint-disable @stylistic/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import { createContainer, type Resolver } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, Job, JobRunner, JobSerializer, NonRetryableJobError, queueBatchContextToken, type QueueBatchContext } from '@nuxt-laravelize/queue/runtime'
import { describe, expect, it, vi } from 'vitest'
import { BullMQConnection } from '../../src/runtime/BullMQConnection'
import { BullMQQueue } from '../../src/runtime/BullMQQueue'
import { BullMQWorker } from '../../src/runtime/BullMQWorker'

const redisUrl = process.env.REDIS_URL
if (!redisUrl && process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1') throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

class BatchIntegrationJob extends Job<{ value: number, fail?: boolean }> {
  static runs: number[] = []
  readonly payload: { value: number, fail?: boolean }
  constructor(payload: Record<string, unknown>) { super(); this.payload = payload as { value: number, fail?: boolean } }
  handle() { if (this.payload.fail) throw new NonRetryableJobError('EXPECTED', 'expected'); BatchIntegrationJob.runs.push(this.payload.value) }
}
class CooperativeIntegrationJob extends Job {
  static started: (() => void) | undefined
  static proceed: Promise<void> = Promise.resolve()
  static failures = 0
  readonly payload = {}
  constructor(_payload: Record<string, unknown>) { super() }
  async handle(resolver: Resolver) { CooperativeIntegrationJob.started?.(); await CooperativeIntegrationJob.proceed; await resolver.make<QueueBatchContext>(queueBatchContextToken).throwIfCancellationRequested() }
  override failed() { CooperativeIntegrationJob.failures += 1 }
}

describe.skipIf(!redisUrl)('BullMQ durable batch integration', () => {
  it('retains bounded dependency progress and cancels delayed children before effects', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null }); const connection = new BullMQConnection(redis)
    const queueName = `batch-${randomUUID()}`; const registry = new InMemoryJobRegistry(); registry.register(BatchIntegrationJob.name, BatchIntegrationJob); registry.register(CooperativeIntegrationJob.name, CooperativeIntegrationJob)
    const runner = new JobRunner(createContainer(), registry); const queue = new BullMQQueue(connection, runner, new JobSerializer()); const worker = new BullMQWorker(connection, registry, runner)
    try {
      BatchIntegrationJob.runs = []; await worker.work(queueName, 2)
      const handle = await queue.batch([{ job: new BatchIntegrationJob({ value: 1 }) }, { job: new BatchIntegrationJob({ value: 2, fail: true }) }], { queue: queueName })
      await vi.waitFor(async () => expect((await queue.batchStatus(handle)).pending).toBe(0), { timeout: 5_000 })
      expect(await queue.batchStatus(handle)).toMatchObject({ succeeded: 1, failed: 1, cancelled: 0, state: 'finished' })
      const cancelled = await queue.batch([{ job: new BatchIntegrationJob({ value: 3 }), options: { delay: 5_000 } }], { queue: queueName })
      await queue.cancelBatch(cancelled)
      await vi.waitFor(async () => expect((await queue.batchStatus(cancelled)).state).toBe('cancelled'), { timeout: 7_000 })
      expect(BatchIntegrationJob.runs).toEqual([1])
      let start!: () => void; const started = new Promise<void>((resolve) => { start = resolve }); let proceed!: () => void
      CooperativeIntegrationJob.started = start; CooperativeIntegrationJob.proceed = new Promise<void>((resolve) => { proceed = resolve }); CooperativeIntegrationJob.failures = 0
      const active = await queue.batch([{ job: new CooperativeIntegrationJob({}) }], { queue: queueName })
      await started; await queue.cancelBatch(active); proceed()
      await vi.waitFor(async () => expect((await queue.batchStatus(active)).state).toBe('cancelled'), { timeout: 5_000 })
      expect(CooperativeIntegrationJob.failures).toBe(0)
      const complete = await queue.batch(Array.from({ length: 100 }, (_, value) => ({ job: new BatchIntegrationJob({ value: value + 10 }) })), { queue: queueName })
      await vi.waitFor(async () => expect(await queue.batchStatus(complete)).toMatchObject({ total: 100, pending: 0, succeeded: 100, failed: 0, cancelled: 0, state: 'finished' }), { timeout: 10_000 })
    }
    finally { await worker.stop(); await queue.clear(queueName); await queue.close(); redis.disconnect() }
  })
})
