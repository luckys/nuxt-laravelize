import { randomUUID } from 'node:crypto'
import { Queue as BullQueue } from 'bullmq'
import Redis from 'ioredis'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, Job, JobRunner, JobSerializer, NonRetryableJobError } from '@nuxt-laravelize/queue/runtime'
import { describe, expect, it, vi } from 'vitest'
import { BullMQConnection } from '../../src/runtime/BullMQConnection'
import { BullMQQueue } from '../../src/runtime/BullMQQueue'
import { BullMQWorker } from '../../src/runtime/BullMQWorker'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.QUEUE_BULLMQ_REDIS_REQUIRED === '1'
if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when QUEUE_BULLMQ_REDIS_REQUIRED=1.')

class BlockingJob extends Job<{ value: number }> {
  static runs: number[] = []
  static started: () => void = () => {}
  static active: Promise<void> = Promise.resolve()
  readonly payload: { value: number }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { value: number }
  }

  async handle(): Promise<void> {
    BlockingJob.runs.push(this.payload.value)
    BlockingJob.started()
    await BlockingJob.active
  }
}

class TerminalBlockingJob extends Job {
  static active: Promise<void> = Promise.resolve()
  static started: () => void = () => {}
  static reporting: Promise<void> = Promise.resolve()
  static reportStarted: () => void = () => {}
  readonly payload = {}
  constructor(_payload: Record<string, unknown>) { super() }

  async handle(): Promise<never> {
    TerminalBlockingJob.started()
    await TerminalBlockingJob.active
    throw new NonRetryableJobError('TERMINAL_DRAIN_TEST', 'terminal')
  }

  override async failed(): Promise<void> {
    TerminalBlockingJob.reportStarted()
    await TerminalBlockingJob.reporting
  }
}

describe.skipIf(!redisUrl)('BullMQ graceful draining integration', () => {
  it('waits for active work without claiming or deleting retained jobs', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const connection = new BullMQConnection(redis)
    const queueName = `drain-${randomUUID()}`
    const registry = new InMemoryJobRegistry()
    registry.register(BlockingJob.name, BlockingJob)
    const runner = new JobRunner(createContainer(), registry)
    const queue = new BullMQQueue(connection, runner, new JobSerializer())
    const worker = new BullMQWorker(connection, registry, runner)
    const inspector = new BullQueue(queueName, { connection: redis })
    let releaseActive!: () => void
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    BlockingJob.active = new Promise<void>((resolve) => {
      releaseActive = resolve
    })
    BlockingJob.started = markStarted
    BlockingJob.runs = []

    let replacement: BullMQWorker | undefined
    try {
      const active = await queue.push(new BlockingJob({ value: 1 }), { queue: queueName })
      const retained = await queue.push(new BlockingJob({ value: 2 }), { queue: queueName })
      const delayed = await queue.push(new BlockingJob({ value: 3 }), { queue: queueName, delay: 60_000 })
      await worker.work(queueName, 1)
      await started

      let stopped = false
      const stopping = worker.stop().then(() => {
        stopped = true
      })
      await Promise.resolve()
      expect(stopped).toBe(false)
      expect(await (await inspector.getJob(active.id))?.getState()).toBe('active')

      releaseActive()
      await stopping
      expect(BlockingJob.runs).toEqual([1])
      expect(await (await inspector.getJob(retained.id))?.getState()).toBe('waiting')
      expect(await (await inspector.getJob(delayed.id))?.getState()).toBe('delayed')

      replacement = new BullMQWorker(connection, registry, runner)
      await replacement.work(queueName, 1)
      await vi.waitFor(() => expect(BlockingJob.runs).toEqual([1, 2]), { timeout: 5_000 })
      await replacement.stop()
    }
    finally {
      releaseActive()
      await worker.stop().catch(() => {})
      await replacement?.stop().catch(() => {})
      await queue.clear(queueName)
      await queue.close()
      await inspector.close()
      redis.disconnect()
    }
  })

  it('waits for terminal reporting emitted while an active job drains', async () => {
    const redis = new Redis(redisUrl!, { maxRetriesPerRequest: null })
    const connection = new BullMQConnection(redis)
    const queueName = `drain-failure-${randomUUID()}`
    const registry = new InMemoryJobRegistry()
    registry.register(TerminalBlockingJob.name, TerminalBlockingJob)
    const runner = new JobRunner(createContainer(), registry)
    const queue = new BullMQQueue(connection, runner, new JobSerializer())
    const worker = new BullMQWorker(connection, registry, runner)
    const failure = vi.fn()
    queue.onFailed(failure)
    let releaseActive!: () => void
    let releaseReporting!: () => void
    let markStarted!: () => void
    let markReportStarted!: () => void
    TerminalBlockingJob.active = new Promise<void>((resolve) => {
      releaseActive = resolve
    })
    TerminalBlockingJob.reporting = new Promise<void>((resolve) => {
      releaseReporting = resolve
    })
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const reportStarted = new Promise<void>((resolve) => {
      markReportStarted = resolve
    })
    TerminalBlockingJob.started = markStarted
    TerminalBlockingJob.reportStarted = markReportStarted

    try {
      await queue.push(new TerminalBlockingJob({}), { queue: queueName, tries: 1 })
      await worker.work(queueName)
      await started
      let stopped = false
      const stopping = worker.stop().then(() => {
        stopped = true
      })

      releaseActive()
      await reportStarted
      await Promise.resolve()
      expect(stopped).toBe(false)

      releaseReporting()
      await stopping
      expect(stopped).toBe(true)
      expect(failure).toHaveBeenCalledOnce()
    }
    finally {
      releaseActive()
      releaseReporting()
      await worker.stop().catch(() => {})
      await queue.clear(queueName)
      await queue.close()
      redis.disconnect()
    }
  })
})
