import { JobSerializer, readJobDispatchIdentity, readJobTags, type Job, type JobDispatchIdentityV1, type SerializedJob } from '../Job'
import type { JobRunner } from '../JobRunner'
import { MAX_JOB_PRIORITY, normalizeDeduplication, type FailedJobCallback, type JobHandle, type PushOptions, type Queue, type QueueChainStep } from '../Queue'
import { currentQueueChainStep, prepareQueueChain, QUEUE_CHAIN_JOB_ID_PREFIX, queueChainJobId } from '../SequentialChain'
import { prepareQueueBatch, QUEUE_BATCH_JOB_ID_PREFIX, queueBatchSnapshot, type QueueBatchHandle, type QueueBatchItem, type QueueBatchOptions, type QueueBatchSnapshot } from '../QueueBatch'

export interface PushedJob { readonly job: Job, readonly options: PushOptions, readonly priority: number, readonly queue?: string, readonly tags: readonly string[], readonly dispatch: JobDispatchIdentityV1, readonly serialized: SerializedJob }
export interface PushedChain { readonly id: string, readonly steps: readonly PushedJob[] }
export interface PushedBatch { readonly id: string, readonly queue: string, readonly children: readonly PushedJob[], cancellationRequested: boolean }

export class QueueFake implements Queue {
  readonly pushed: PushedJob[] = []
  readonly chains: PushedChain[] = []
  readonly batches: PushedBatch[] = []
  readonly #deduplication = new Map<string, Map<string, { readonly handle: JobHandle, readonly expiresAt?: number }>>()
  #nextId = 1
  #deduplicationTimer?: ReturnType<typeof setTimeout>
  #deduplicationTimerDueAt?: number
  constructor(
    private readonly serializer = new JobSerializer(),
    private readonly runner?: JobRunner,
  ) {}

  async push(job: Job, options: PushOptions = {}): Promise<JobHandle> {
    if (options.id?.startsWith(QUEUE_CHAIN_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue chain prefix')
    if (options.id?.startsWith(QUEUE_BATCH_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue batch prefix')
    if (options.id !== undefined && options.deduplication !== undefined) throw new TypeError('id and deduplication cannot be combined')
    const priority = options.priority ?? (job.constructor as typeof Job).priority
    if (!Number.isSafeInteger(priority) || priority < 0 || priority > MAX_JOB_PRIORITY) throw new TypeError(`priority must be an integer between 0 and ${MAX_JOB_PRIORITY}`)
    const queue = options.queue ?? (job.constructor as typeof Job).queue
    const serialized = this.#serialize(job, queue)
    const tags = readJobTags(serialized)
    const dispatch = readJobDispatchIdentity(serialized)!
    const deduplication = normalizeDeduplication(options.deduplication)
    if (deduplication) {
      const reservations = this.#deduplication.get(queue)
      const reservation = reservations?.get(deduplication.id)
      if (reservation && (reservation.expiresAt === undefined || reservation.expiresAt > Date.now())) return reservation.handle
      if (reservation) reservations!.delete(deduplication.id)
    }
    this.pushed.push({ job, options, priority, queue, tags, dispatch, serialized })
    const handle = { id: options.id ?? `fake-${this.#nextId++}`, queue }
    if (deduplication) {
      const reservations = this.#deduplication.get(queue) ?? new Map()
      reservations.set(deduplication.id, { handle, ...(deduplication.ttl === undefined ? {} : { expiresAt: Date.now() + deduplication.ttl }) })
      this.#deduplication.set(queue, reservations)
      if (deduplication.ttl !== undefined) this.#scheduleDeduplicationExpiry(Date.now() + deduplication.ttl)
    }
    return handle
  }

  async chain(steps: readonly QueueChainStep[]): Promise<JobHandle> {
    const chain = prepareQueueChain(steps, this.serializer, (job, queue, serializer) => this.#serialize(job, queue, serializer))
    const recorded = chain.steps.map((step, index): PushedJob => ({
      job: steps[index]!.job,
      options: step.options,
      priority: step.options.priority,
      queue: step.options.queue,
      tags: readJobTags(step.serialized),
      dispatch: readJobDispatchIdentity(step.serialized)!,
      serialized: step.serialized,
    }))
    const current = currentQueueChainStep(chain)
    const handle = { id: queueChainJobId(chain), queue: current.options.queue }
    this.chains.push({ id: chain.id, steps: recorded })
    this.pushed.push(recorded[0]!)
    return handle
  }

  async batch(items: readonly QueueBatchItem[], options?: QueueBatchOptions): Promise<QueueBatchHandle> {
    const prepared = prepareQueueBatch(items, options, this.serializer, (job, queue, serializer) => this.#serialize(job, queue, serializer))
    const children = prepared.children.map((child, index): PushedJob => ({
      job: items[index]!.job,
      options: { ...child.options, queue: prepared.handle.queue },
      priority: child.options.priority,
      queue: prepared.handle.queue,
      tags: readJobTags(child.serialized),
      dispatch: readJobDispatchIdentity(child.serialized)!,
      serialized: child.serialized,
    }))
    this.batches.push({ id: prepared.handle.id, queue: prepared.handle.queue, children, cancellationRequested: false })
    this.pushed.push(...children)
    return prepared.handle
  }

  async batchStatus(handle: QueueBatchHandle): Promise<QueueBatchSnapshot> {
    const batch = this.#batch(handle)
    return queueBatchSnapshot(batch.children.length, 0, 0, batch.cancellationRequested ? batch.children.length : 0, batch.cancellationRequested)
  }

  async cancelBatch(handle: QueueBatchHandle): Promise<QueueBatchSnapshot> {
    this.#batch(handle).cancellationRequested = true
    return this.batchStatus(handle)
  }

  later(delay: number, job: Job, options: PushOptions = {}): Promise<JobHandle> { return this.push(job, { ...options, delay }) }
  async sync(job: Job): Promise<void> {
    const queue = (job.constructor as typeof Job).queue
    this.#serialize(job, queue)
  }

  async size(queue?: string): Promise<number> { return queue === undefined ? this.pushed.length : this.pushed.filter(item => item.queue === queue).length }
  async clear(queue?: string): Promise<void> {
    if (queue === undefined) {
      this.pushed.length = 0
      this.chains.length = 0
      this.batches.length = 0
      this.#deduplication.clear()
      this.#clearDeduplicationTimer()
    }
    else {
      this.pushed.splice(0, this.pushed.length, ...this.pushed.filter(item => item.queue !== queue))
      this.chains.splice(0, this.chains.length, ...this.chains.filter(item => item.steps[0]?.queue !== queue))
      this.batches.splice(0, this.batches.length, ...this.batches.filter(item => item.queue !== queue))
      this.#deduplication.delete(queue)
      this.#rescheduleDeduplicationExpiry()
    }
  }

  onFailed(_callback: FailedJobCallback): void {}
  assertPushed<T extends Job>(type: new (...args: never[]) => T): void {
    if (!this.pushed.some(item => item.job instanceof type)) throw new Error(`Expected ${type.name} to be pushed.`)
  }

  #serialize(job: Job, queue: string, serializer = this.serializer): SerializedJob {
    if (serializer.requiresAdmission() && !this.runner) throw new TypeError('QueueFake requires a JobRunner for admission metadata')
    return serializer.requiresAdmission() ? this.runner!.serialize(job, queue, serializer) : serializer.serialize(job)
  }

  #batch(handle: QueueBatchHandle): PushedBatch {
    const batch = this.batches.find(item => item.id === handle.id && item.queue === handle.queue)
    if (!batch) throw new TypeError('Queue batch was not found')
    return batch
  }

  #scheduleDeduplicationExpiry(expiresAt: number): void {
    if (this.#deduplicationTimerDueAt !== undefined && this.#deduplicationTimerDueAt <= expiresAt) return
    this.#clearDeduplicationTimer()
    this.#deduplicationTimerDueAt = expiresAt
    this.#deduplicationTimer = setTimeout(() => {
      this.#deduplicationTimer = undefined
      this.#deduplicationTimerDueAt = undefined
      this.#sweepDeduplication()
    }, Math.max(0, expiresAt - Date.now()))
    this.#deduplicationTimer.unref?.()
  }

  #sweepDeduplication(): void {
    const now = Date.now()
    let nextExpiry: number | undefined
    for (const [queue, reservations] of this.#deduplication) {
      for (const [id, reservation] of reservations) {
        if (reservation.expiresAt !== undefined && reservation.expiresAt <= now) reservations.delete(id)
        else if (reservation.expiresAt !== undefined) nextExpiry = Math.min(nextExpiry ?? reservation.expiresAt, reservation.expiresAt)
      }
      if (reservations.size === 0) this.#deduplication.delete(queue)
    }
    if (nextExpiry !== undefined) this.#scheduleDeduplicationExpiry(nextExpiry)
  }

  #rescheduleDeduplicationExpiry(): void {
    this.#clearDeduplicationTimer()
    let nextExpiry: number | undefined
    for (const reservations of this.#deduplication.values()) {
      for (const reservation of reservations.values()) {
        if (reservation.expiresAt !== undefined) nextExpiry = Math.min(nextExpiry ?? reservation.expiresAt, reservation.expiresAt)
      }
    }
    if (nextExpiry !== undefined) this.#scheduleDeduplicationExpiry(nextExpiry)
  }

  #clearDeduplicationTimer(): void {
    if (this.#deduplicationTimer !== undefined) clearTimeout(this.#deduplicationTimer)
    this.#deduplicationTimer = undefined
    this.#deduplicationTimerDueAt = undefined
  }
}
