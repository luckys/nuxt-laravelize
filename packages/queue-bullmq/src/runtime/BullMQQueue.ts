import { createHash } from 'node:crypto'
import { FlowProducer, Queue as BullQueue } from 'bullmq'
import { createQueueBatchCoordinator, currentQueueChainStep, MAX_JOB_PRIORITY, prepareQueueBatch, prepareQueueChain, QUEUE_BATCH_JOB_ID_PREFIX, QUEUE_CHAIN_JOB_ID_PREFIX, queueBatchChildJobId, queueBatchCoordinatorJobId, queueBatchSnapshot, readQueueBatchChildEnvelope, readQueueBatchCoordinatorEnvelope, queueChainJobId, type Job, type JobDeduplicationOptions, type JobHandle, type PushOptions, type Queue, type JobRunner, type JobSerializer, type PreparedQueueBatch, type QueueBatchHandle, type QueueBatchItem, type QueueBatchOptions, type QueueBatchSnapshot, type QueueChainStep, type ResolvedQueueBatchItemOptions, type ResolvedQueueChainOptions } from '@nuxt-laravelize/queue/runtime'
import type { BullMQConnection } from './BullMQConnection'
import type { FailureReporter } from './FailureReporter'

export class BullMQQueue implements Queue {
  readonly #queues = new Map<string, BullQueue>()
  #flowProducer?: FlowProducer
  constructor(
    private readonly connection: BullMQConnection,
    private readonly runner: JobRunner,
    private readonly serializer: JobSerializer,
    private readonly failures: FailureReporter = connection.failures,
  ) {}

  async push(job: Job, options: PushOptions = {}): Promise<JobHandle> {
    if (options.id !== undefined && options.deduplication !== undefined) throw new TypeError('id and deduplication cannot be combined')
    if (options.id?.startsWith(QUEUE_CHAIN_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue chain prefix')
    if (options.id?.startsWith(QUEUE_BATCH_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue batch prefix')
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

  async batch(items: readonly QueueBatchItem[], options?: QueueBatchOptions): Promise<QueueBatchHandle> {
    const batch = prepareQueueBatch(items, options, this.serializer, (job, queue, serializer) => this.#serialize(job, queue, serializer))
    const rootId = queueBatchCoordinatorJobId(batch.handle.id)
    const flow = await this.#flow().add({
      name: QUEUE_BATCH_COORDINATOR_KIND_NAME,
      queueName: batch.handle.queue,
      data: batch.coordinator,
      opts: { jobId: rootId, removeOnComplete: BULLMQ_BATCH_COMPLETE_RETENTION, removeOnFail: BULLMQ_BATCH_COORDINATOR_FAILURE_RETENTION },
      children: batch.children.map(child => ({
        name: child.serialized.name,
        queueName: batch.handle.queue,
        data: child,
        opts: { ...bullMQBatchOptions(child.options, queueBatchChildJobId(child.id, child.index)), ignoreDependencyOnFailure: true, removeOnComplete: BULLMQ_BATCH_COMPLETE_RETENTION, removeOnFail: BULLMQ_BATCH_CHILD_FAILURE_RETENTION },
      })),
    })
    if (!matchesAddedBatchFlow(flow, batch)) throw new TypeError('BullMQ queue batch transport identity mismatch')
    return batch.handle
  }

  async batchStatus(handle: QueueBatchHandle): Promise<QueueBatchSnapshot> {
    const coordinator = await this.#coordinator(handle)
    const dependencies = await coordinator.job.getDependencies() as unknown as Record<string, unknown>
    const processed = dependencyRecord(dependencies.processed)
    const ignored = dependencyRecord(dependencies.ignored)
    const unprocessed = dependencyKeys(dependencies.unprocessed)
    const failed = dependencyKeys(dependencies.failed)
    if (failed.length > 0) throw new TypeError('Invalid BullMQ queue batch failed dependencies')
    assertCompleteBatchDependencies(coordinator.job.queueQualifiedName, coordinator.data.id, coordinator.data.total, Object.keys(processed), Object.keys(ignored), unprocessed)
    let succeeded = 0
    let cancelled = 0
    for (const value of Object.values(processed)) {
      const result = readBatchResult(value)
      if (result === 'succeeded') succeeded += 1
      else if (result === 'cancelled') cancelled += 1
      else throw new TypeError('Invalid BullMQ queue batch processed result')
    }
    return queueBatchSnapshot(coordinator.data.total, succeeded, Object.keys(ignored).length, cancelled, coordinator.data.cancellationRequested)
  }

  async cancelBatch(handle: QueueBatchHandle): Promise<QueueBatchSnapshot> {
    const coordinator = await this.#coordinator(handle)
    if (!coordinator.data.cancellationRequested) await coordinator.job.updateData(createQueueBatchCoordinator(coordinator.data.id, coordinator.data.queue, coordinator.data.total, true))
    return this.batchStatus(handle)
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

  async close(): Promise<void> { await Promise.all([...this.#queues.values()].map(queue => queue.close()).concat(this.#flowProducer ? [this.#flowProducer.close()] : [])) }

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

  #flow(): FlowProducer {
    this.#flowProducer ??= new FlowProducer({ connection: this.connection.client, ...(this.connection.prefix === undefined ? {} : { prefix: this.connection.prefix }) })
    return this.#flowProducer
  }

  async #coordinator(handle: QueueBatchHandle) {
    assertBatchHandle(handle)
    const job = await this.#queue(handle.queue).getJob(queueBatchCoordinatorJobId(handle.id))
    if (!job) throw new TypeError('Queue batch was not found')
    const data = readQueueBatchCoordinatorEnvelope(job.data)
    if (!data || data.id !== handle.id || data.queue !== handle.queue || String(job.id) !== queueBatchCoordinatorJobId(handle.id) || job.name !== QUEUE_BATCH_COORDINATOR_KIND_NAME || !matchesQueueQualifiedName(job.queueQualifiedName, handle.queue)) throw new TypeError('Invalid BullMQ queue batch coordinator')
    return { job, data }
  }
}

export const QUEUE_BATCH_COORDINATOR_KIND_NAME = '__nuxt_laravelize_batch_coordinator__'
export const BULLMQ_BATCH_COMPLETE_RETENTION = Object.freeze({ age: 86_400, count: 1000 })
export const BULLMQ_BATCH_CHILD_FAILURE_RETENTION = Object.freeze({ age: 604_800, count: 1000 })
export const BULLMQ_BATCH_COORDINATOR_FAILURE_RETENTION = BULLMQ_BATCH_COMPLETE_RETENTION

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

export function bullMQBatchOptions(options: ResolvedQueueBatchItemOptions, jobId: string) {
  return { jobId, attempts: options.tries, delay: options.delay, backoff: { type: 'fixed', delay: readBackoff(options.backoff) }, ...(options.priority > 0 ? { priority: options.priority } : {}) }
}

function readBatchResult(value: unknown): 'succeeded' | 'cancelled' | undefined {
  if (typeof value === 'string') {
    try {
      return readBatchResult(JSON.parse(value))
    }
    catch {
      return undefined
    }
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 1) return undefined
  const status = (value as { status?: unknown }).status
  return status === 'succeeded' || status === 'cancelled' ? status : undefined
}

function dependencyRecord(value: unknown): Record<string, unknown> {
  if (value === undefined) return {}
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid BullMQ queue batch dependencies')
  const record = value as Record<string, unknown>
  for (const key of Reflect.ownKeys(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key)
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable || !validDependencyKey(key)) throw new TypeError('Invalid BullMQ queue batch dependencies')
  }
  return record
}

function dependencyKeys(value: unknown): string[] {
  if (value === undefined) return []
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
    if (!value.every(item => typeof item === 'string' && validDependencyKey(item))) throw new TypeError('Invalid BullMQ queue batch dependencies')
    return [...value]
  }
  return Object.keys(dependencyRecord(value))
}

function assertCompleteBatchDependencies(queueQualifiedName: unknown, id: string, total: number, processed: readonly string[], ignored: readonly string[], unprocessed: readonly string[]): void {
  if (!validQueueQualifiedName(queueQualifiedName)) throw new TypeError('Invalid BullMQ queue batch dependencies')
  const categories = [processed, ignored, unprocessed]
  const all = categories.flat()
  if (new Set(all).size !== all.length) throw new TypeError('Invalid BullMQ queue batch dependencies')
  const actual = new Set(all)
  const expected = new Set(Array.from({ length: total }, (_, index) => `${queueQualifiedName}:${queueBatchChildJobId(id, index)}`))
  if (actual.size !== expected.size || [...actual].some(key => !expected.has(key))) throw new TypeError('Invalid BullMQ queue batch dependencies')
}

function matchesAddedBatchFlow(flow: Awaited<ReturnType<FlowProducer['add']>>, batch: PreparedQueueBatch): boolean {
  const rootId = queueBatchCoordinatorJobId(batch.handle.id)
  if (String(flow.job.id) !== rootId || flow.job.opts.jobId !== rootId || flow.job.name !== QUEUE_BATCH_COORDINATOR_KIND_NAME || !validQueueQualifiedName(flow.job.queueQualifiedName)) return false
  const coordinator = readQueueBatchCoordinatorEnvelope(flow.job.data)
  if (!coordinator || coordinator.fingerprint !== batch.coordinator.fingerprint || !matchesRetention(flow.job.opts.removeOnComplete, BULLMQ_BATCH_COMPLETE_RETENTION) || !matchesRetention(flow.job.opts.removeOnFail, BULLMQ_BATCH_COORDINATOR_FAILURE_RETENTION)) return false
  if (flow.children?.length !== batch.children.length) return false
  const parentKey = `${flow.job.queueQualifiedName}:${rootId}`
  return flow.children.every((child, index) => {
    const expected = batch.children[index]!
    const persisted = readQueueBatchChildEnvelope(child.job.data)
    const childId = queueBatchChildJobId(batch.handle.id, index)
    return String(child.job.id) === childId
      && child.job.opts.jobId === childId
      && child.job.name === expected.serialized.name
      && persisted?.fingerprint === expected.fingerprint
      && child.job.queueQualifiedName === flow.job.queueQualifiedName
      && child.job.parentKey === parentKey
      && matchesBatchJobOptions(child.job.opts, expected.options)
  })
}

export function matchesBatchJobOptions(value: unknown, expected: ResolvedQueueBatchItemOptions): boolean {
  if (!value || typeof value !== 'object') return false
  const options = value as Record<string, unknown>
  const backoff = options.backoff as number | { type?: unknown, delay?: unknown } | undefined
  const backoffDelay = typeof backoff === 'number' ? backoff : backoff?.delay ?? 0
  const expectedBackoff = typeof expected.backoff === 'number' ? expected.backoff : expected.backoff[0] ?? 0
  return (options.attempts ?? 1) === expected.tries
    && (options.delay ?? 0) === expected.delay
    && (options.priority ?? 0) === expected.priority
    && backoffDelay === expectedBackoff
    && (typeof backoff !== 'object' || backoff.type === 'fixed')
    && options.ignoreDependencyOnFailure === true
    && matchesRetention(options.removeOnComplete, BULLMQ_BATCH_COMPLETE_RETENTION)
    && matchesRetention(options.removeOnFail, BULLMQ_BATCH_CHILD_FAILURE_RETENTION)
}

function matchesRetention(value: unknown, expected: { readonly age: number, readonly count: number }): boolean {
  return Boolean(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === 2 && (value as { age?: unknown }).age === expected.age && (value as { count?: unknown }).count === expected.count)
}

export function validQueueQualifiedName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\r\n\0]/.test(value)
}

export function matchesQueueQualifiedName(value: unknown, queue: string): value is string {
  return validQueueQualifiedName(value) && value.endsWith(`:${queue}`)
}

function validDependencyKey(value: string): boolean {
  return value.length > 0 && value.length <= 1280 && !/[\r\n\0]/.test(value)
}

function assertBatchHandle(value: unknown): asserts value is QueueBatchHandle {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 2) throw new TypeError('Invalid queue batch handle')
  for (const key of ['id', 'queue']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Invalid queue batch handle')
  }
  const handle = value as Partial<QueueBatchHandle>
  if (typeof handle.id !== 'string' || !/^[A-Z0-9][\w-]{0,127}$/i.test(handle.id) || typeof handle.queue !== 'string' || handle.queue.length > 256 || /[\r\n\0]/.test(handle.queue)) throw new TypeError('Invalid queue batch handle')
}
