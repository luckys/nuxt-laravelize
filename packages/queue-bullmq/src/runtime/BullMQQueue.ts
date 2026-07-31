import { createHash } from 'node:crypto'
import { Queue as BullQueue } from 'bullmq'
import { currentQueueChainStep, MAX_JOB_PRIORITY, prepareQueueChain, QUEUE_CHAIN_JOB_ID_PREFIX, queueChainJobId, type Job, type JobDeduplicationOptions, type JobHandle, type PushOptions, type Queue, type JobRunner, type JobSerializer, type QueueChainStep, type ResolvedQueueChainOptions } from '@nuxt-laravelize/queue/runtime'
import type { BullMQConnection } from './BullMQConnection'
import type { FailureReporter } from './FailureReporter'

export class BullMQQueue implements Queue {
  readonly #queues = new Map<string, BullQueue>()
  constructor(
    private readonly connection: BullMQConnection,
    private readonly runner: JobRunner,
    private readonly serializer: JobSerializer,
    private readonly failures: FailureReporter = connection.failures,
  ) {}

  async push(job: Job, options: PushOptions = {}): Promise<JobHandle> {
    if (options.id !== undefined && options.deduplication !== undefined) throw new TypeError('id and deduplication cannot be combined')
    if (options.id?.startsWith(QUEUE_CHAIN_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue chain prefix')
    if (options.id?.includes(':')) throw new TypeError('BullMQ job id must not contain a colon')
    const config = job.constructor as typeof Job
    const queueName = options.queue ?? config.queue
    const attempts = integer(options.tries ?? config.tries, 'tries', 1, 1000)
    const delay = integer(options.delay ?? config.delay, 'delay', 0, 86_400_000)
    const priority = integer(options.priority ?? config.priority, 'priority', 0, MAX_JOB_PRIORITY)
    const deduplication = readDeduplication(options.deduplication)
    const serialized = this.#serialize(job, queueName)
    const queued = await this.#queue(queueName).add(config.jobName ?? config.name, serialized, {
      ...(options.id ? { jobId: options.id } : {}),
      attempts,
      delay,
      backoff: { type: 'fixed', delay: readBackoff(options.backoff ?? config.backoff) },
      ...(priority > 0 ? { priority } : {}),
      ...(deduplication ? { deduplication: { id: deduplicationId(deduplication.id), ...(deduplication.ttl === undefined ? {} : { ttl: deduplication.ttl }) } } : {}),
    })
    return { id: String(queued.id ?? ''), queue: queueName }
  }

  async chain(steps: readonly QueueChainStep[]): Promise<JobHandle> {
    const chain = prepareQueueChain(steps, this.serializer, (job, queue, serializer) => this.#serialize(job, queue, serializer))
    const current = currentQueueChainStep(chain)
    const queued = await this.#queue(current.options.queue).add(current.serialized.name, chain, bullMQOptions(current.options, queueChainJobId(chain)))
    return { id: String(queued.id ?? ''), queue: current.options.queue }
  }

  later(delay: number, job: Job, options: PushOptions = {}): Promise<JobHandle> { return this.push(job, { ...options, delay }) }
  sync(job: Job): Promise<void> {
    const queue = (job.constructor as typeof Job).queue
    return this.runner.run(this.#serialize(job, queue), { queue })
  }

  onFailed(callback: Parameters<FailureReporter['listen']>[0]): void { this.failures.listen(callback) }
  async size(queue?: string): Promise<number> {
    if (queue !== undefined) return this.#queue(queue).count()
    let count = 0
    for (const item of this.#queues.values()) count += await item.count()
    return count
  }

  async clear(queue?: string): Promise<void> {
    const queues = queue === undefined ? [...this.#queues.values()] : [this.#queue(queue)]
    await Promise.all(queues.map(async (item) => {
      await item.drain()
      await item.obliterate({ force: true })
    }))
  }

  async close(): Promise<void> { await Promise.all([...this.#queues.values()].map(queue => queue.close())) }

  #serialize(job: Job, queue: string, serializer = this.serializer) {
    return serializer.requiresAdmission() ? this.runner.serialize(job, queue, serializer) : serializer.serialize(job)
  }

  #queue(name: string): BullQueue {
    const existing = this.#queues.get(name)
    if (existing) return existing
    const queue = new BullQueue(name, {
      connection: this.connection.client,
      ...(this.connection.prefix === undefined ? {} : { prefix: this.connection.prefix }),
    })
    this.#queues.set(name, queue)
    return queue
  }
}

function readBackoff(backoff: number | readonly number[]): number {
  return integer(typeof backoff === 'number' ? backoff : backoff[0] ?? 0, 'backoff', 0, 86_400_000)
}
function integer(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`)
  return value
}

function readDeduplication(value?: JobDeduplicationOptions): JobDeduplicationOptions | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'id' && key !== 'ttl')) throw new TypeError('deduplication must contain only id and optional ttl')
  if (typeof value.id !== 'string' || !/^[A-Z0-9][\w.:-]{0,255}$/i.test(value.id)) throw new TypeError('deduplication id must be a safe identifier of at most 256 characters')
  if (value.ttl !== undefined) integer(value.ttl, 'deduplication ttl', 1, 86_400_000)
  return { id: value.id, ...(value.ttl === undefined ? {} : { ttl: value.ttl }) }
}

function deduplicationId(id: string): string {
  return `v1-${createHash('sha256').update(id).digest('base64url')}`
}

export function bullMQOptions(options: ResolvedQueueChainOptions, jobId: string) {
  return {
    jobId,
    attempts: options.tries,
    delay: options.delay,
    backoff: { type: 'fixed', delay: readBackoff(options.backoff) },
    ...(options.priority > 0 ? { priority: options.priority } : {}),
  }
}
