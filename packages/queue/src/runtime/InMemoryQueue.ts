import { JobSerializer, type Job, type SerializedJob } from './Job'
import type { JobRunner } from './JobRunner'
import { MAX_JOB_PRIORITY, normalizeDeduplication, type FailedJobCallback, type JobDeduplicationOptions, type JobHandle, type PushOptions, type Queue, type QueueChainStep } from './Queue'
import { isNonRetryableJobError, NonRetryableJobError } from './NonRetryableJobError'
import { isJobReleasedError } from './JobReleasedError'
import { currentQueueChainStep, nextQueueChainEnvelope, prepareQueueChain, QUEUE_CHAIN_JOB_ID_PREFIX, queueChainJobId, type QueueChainEnvelopeV1 } from './SequentialChain'
import { isQueueBatchCancelledError, prepareQueueBatch, QUEUE_BATCH_JOB_ID_PREFIX, queueBatchChildJobId, queueBatchSnapshot, type QueueBatchChildEnvelopeV1, type QueueBatchHandle, type QueueBatchItem, type QueueBatchOptions, type QueueBatchSnapshot } from './QueueBatch'

interface ResolvedOptions {
  readonly id?: string
  readonly tries: number
  readonly delay: number
  readonly queue: string
  readonly backoff: number | readonly number[]
  readonly priority: number
  readonly deduplication?: JobDeduplicationOptions
}

interface PendingJob {
  readonly serialized: SerializedJob
  readonly options: ResolvedOptions
  readonly handle: JobHandle
  attempt: number
  releases: number
  ready: boolean
  readonly sequence: number
  readonly chain?: QueueChainEnvelopeV1
  readonly batch?: QueueBatchChildEnvelopeV1
}

interface MemoryBatch { readonly handle: QueueBatchHandle, readonly total: number, cancellationRequested: boolean, succeeded: number, failed: number, cancelled: number }

interface DeduplicationReservation {
  readonly handle: JobHandle
  readonly expiresAt?: number
}

export class InMemoryQueue implements Queue {
  readonly #pending = new Map<string, PendingJob[]>()
  readonly #timers = new Map<ReturnType<typeof setTimeout>, PendingJob>()
  readonly #failedCallbacks: FailedJobCallback[] = []
  readonly #scheduledQueues = new Set<string>()
  readonly #deduplication = new Map<string, Map<string, DeduplicationReservation>>()
  readonly #batches = new Map<string, MemoryBatch>()
  #deduplicationTimer?: ReturnType<typeof setTimeout>
  #deduplicationTimerDueAt?: number
  #nextId = 1
  #nextSequence = 1

  constructor(private readonly runner: JobRunner, private readonly serializer: JobSerializer = new JobSerializer()) {}

  async push(job: Job, options?: PushOptions): Promise<JobHandle> {
    const resolved = resolveOptions(job, options)
    const serialized = this.#serialize(job, resolved.queue)
    const duplicate = resolved.deduplication ? this.#deduplicated(resolved.queue, resolved.deduplication.id) : undefined
    if (duplicate) return duplicate
    const entry: PendingJob = {
      serialized,
      options: resolved,
      handle: { id: resolved.id ?? `memory-${this.#nextId++}`, queue: resolved.queue },
      attempt: 0,
      releases: 0,
      ready: false,
      sequence: this.#nextSequence++,
    }
    this.#reserveDeduplication(entry)
    this.#enqueue(entry, resolved.delay)
    return entry.handle
  }

  async chain(steps: readonly QueueChainStep[]): Promise<JobHandle> {
    const chain = prepareQueueChain(steps, this.serializer, (job, queue, serializer) => this.#serialize(job, queue, serializer))
    const entry = this.#chainEntry(chain)
    this.#enqueue(entry, entry.options.delay)
    return entry.handle
  }

  async batch(items: readonly QueueBatchItem[], options?: QueueBatchOptions): Promise<QueueBatchHandle> {
    const prepared = prepareQueueBatch(items, options, this.serializer, (job, queue, serializer) => this.#serialize(job, queue, serializer))
    const record: MemoryBatch = { handle: prepared.handle, total: prepared.children.length, cancellationRequested: false, succeeded: 0, failed: 0, cancelled: 0 }
    const entries = prepared.children.map(child => this.#batchEntry(child, prepared.handle.queue))
    this.#batches.set(prepared.handle.id, record)
    for (const entry of entries) this.#enqueue(entry, entry.options.delay)
    return prepared.handle
  }

  async batchStatus(handle: QueueBatchHandle): Promise<QueueBatchSnapshot> {
    const batch = this.#memoryBatch(handle)
    return queueBatchSnapshot(batch.total, batch.succeeded, batch.failed, batch.cancelled, batch.cancellationRequested)
  }

  async cancelBatch(handle: QueueBatchHandle): Promise<QueueBatchSnapshot> {
    const batch = this.#memoryBatch(handle)
    batch.cancellationRequested = true
    for (const jobs of this.#pending.values()) {
      for (const entry of [...jobs]) {
        if (entry.batch?.id !== handle.id || !this.#removePending(entry)) continue
        this.#clearEntryTimer(entry)
        this.#settleBatch(entry, 'cancelled')
      }
    }
    return this.batchStatus(handle)
  }

  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle> {
    return this.push(job, { ...options, delay: delayMs })
  }

  sync(job: Job): Promise<void> {
    const queue = (job.constructor as typeof Job).queue
    return this.runner.run(this.#serialize(job, queue), { queue })
  }

  async size(queueName?: string): Promise<number> {
    if (queueName !== undefined) return this.#pending.get(queueName)?.length ?? 0
    return [...this.#pending.values()].reduce((total, jobs) => total + jobs.length, 0)
  }

  async clear(queueName?: string): Promise<void> {
    if (queueName !== undefined) {
      this.#pending.delete(queueName)
      this.#deduplication.delete(queueName)
      for (const [id, batch] of this.#batches) if (batch.handle.queue === queueName) this.#batches.delete(id)
    }
    else {
      this.#pending.clear()
      this.#deduplication.clear()
      this.#batches.clear()
      this.#clearDeduplicationTimer()
    }
    if (queueName !== undefined) this.#rescheduleDeduplicationExpiry()
    for (const [timer, entry] of this.#timers) {
      if (queueName === undefined || entry.options.queue === queueName) {
        clearTimeout(timer)
        this.#timers.delete(timer)
      }
    }
  }

  onFailed(callback: FailedJobCallback): void { this.#failedCallbacks.push(callback) }

  #serialize(job: Job, queue: string, serializer = this.serializer): SerializedJob {
    return serializer.requiresAdmission() ? this.runner.serialize(job, queue, serializer) : serializer.serialize(job)
  }

  #chainEntry(chain: QueueChainEnvelopeV1): PendingJob {
    const step = currentQueueChainStep(chain)
    return {
      serialized: step.serialized,
      options: step.options,
      handle: { id: queueChainJobId(chain), queue: step.options.queue },
      attempt: 0,
      releases: 0,
      ready: false,
      sequence: this.#nextSequence++,
      chain,
    }
  }

  #batchEntry(batch: QueueBatchChildEnvelopeV1, queue: string): PendingJob {
    return {
      serialized: batch.serialized,
      options: { ...batch.options, queue },
      handle: { id: queueBatchChildJobId(batch.id, batch.index), queue },
      attempt: 0,
      releases: 0,
      ready: false,
      sequence: this.#nextSequence++,
      batch,
    }
  }

  #enqueue(entry: PendingJob, delay: number): void {
    entry.ready = false
    const jobs = this.#pending.get(entry.options.queue) ?? []
    jobs.push(entry)
    this.#pending.set(entry.options.queue, jobs)
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.#timers.delete(timer)
        entry.ready = true
        this.#schedule(entry.options.queue)
      }, delay)
      this.#timers.set(timer, entry)
      return
    }
    entry.ready = true
    this.#schedule(entry.options.queue)
  }

  #schedule(queue: string): void {
    if (this.#scheduledQueues.has(queue)) return
    this.#scheduledQueues.add(queue)
    queueMicrotask(() => {
      this.#scheduledQueues.delete(queue)
      const ready = (this.#pending.get(queue) ?? [])
        .filter(entry => entry.ready)
        .sort((left, right) => left.options.priority - right.options.priority || left.sequence - right.sequence)
      for (const entry of ready) void this.#run(entry)
    })
  }

  async #run(entry: PendingJob): Promise<void> {
    if (!this.#removePending(entry)) return
    if (entry.batch && this.#batches.get(entry.batch.id)?.cancellationRequested) {
      this.#settleBatch(entry, 'cancelled')
      return
    }
    entry.attempt += 1
    try {
      await this.runner.run(entry.serialized, {
        queue: entry.options.queue,
        attempt: entry.attempt,
        maxAttempts: entry.options.tries,
        ...(entry.batch ? { batch: { id: entry.batch.id, queue: entry.options.queue, isCancellationRequested: async () => this.#batches.get(entry.batch!.id)?.cancellationRequested ?? true } } : {}),
      })
    }
    catch (error) {
      let failure = error
      if (entry.batch && isQueueBatchCancelledError(failure) && this.#batches.get(entry.batch.id)?.cancellationRequested) {
        this.#settleBatch(entry, 'cancelled')
        return
      }
      if (isJobReleasedError(failure)) {
        if (entry.releases < failure.maxReleases) {
          entry.attempt -= 1
          entry.releases += 1
          this.#enqueue(entry, failure.delay)
          return
        }
        failure = new NonRetryableJobError('JOB_RELEASE_LIMIT_EXCEEDED', 'Job exceeded its delayed release budget', { cause: failure.cause ?? failure })
      }
      if (!isNonRetryableJobError(failure) && entry.attempt < entry.options.tries) {
        this.#enqueue(entry, resolveBackoff(entry.options.backoff, entry.attempt))
        return
      }
      this.#releaseDeduplication(entry)
      try {
        await this.runner.failed(entry.serialized, failure, { queue: entry.options.queue, attempt: entry.attempt, maxAttempts: entry.options.tries })
      }
      catch {
        // A job failure callback is an isolated observer of the original failure.
      }
      for (const callback of this.#failedCallbacks) {
        try {
          await callback({ job: this.runner.rehydrate(entry.serialized), queue: entry.options.queue, error: failure, attempts: entry.attempt })
        }
        catch { /* Failure observers cannot alter queue completion. */ }
      }
      this.#settleBatch(entry, 'failed')
      return
    }
    const next = entry.chain ? nextQueueChainEnvelope(entry.chain) : undefined
    if (next) {
      const successor = this.#chainEntry(next)
      this.#enqueue(successor, successor.options.delay)
    }
    this.#releaseDeduplication(entry)
    this.#settleBatch(entry, 'succeeded')
  }

  #settleBatch(entry: PendingJob, outcome: 'succeeded' | 'failed' | 'cancelled'): void {
    if (!entry.batch) return
    const batch = this.#batches.get(entry.batch.id)
    if (!batch) return
    batch[outcome] += 1
  }

  #memoryBatch(handle: QueueBatchHandle): MemoryBatch {
    const batch = this.#batches.get(handle.id)
    if (!batch || batch.handle.queue !== handle.queue) throw new TypeError('Queue batch was not found')
    return batch
  }

  #clearEntryTimer(entry: PendingJob): void {
    for (const [timer, scheduled] of this.#timers) {
      if (scheduled !== entry) continue
      clearTimeout(timer)
      this.#timers.delete(timer)
    }
  }

  #deduplicated(queue: string, id: string): JobHandle | undefined {
    const reservations = this.#deduplication.get(queue)
    const reservation = reservations?.get(id)
    if (!reservation) return undefined
    if (reservation.expiresAt !== undefined && reservation.expiresAt <= Date.now()) {
      reservations!.delete(id)
      if (reservations!.size === 0) this.#deduplication.delete(queue)
      return undefined
    }
    return reservation.handle
  }

  #reserveDeduplication(entry: PendingJob): void {
    const deduplication = entry.options.deduplication
    if (!deduplication) return
    const reservations = this.#deduplication.get(entry.options.queue) ?? new Map<string, DeduplicationReservation>()
    reservations.set(deduplication.id, {
      handle: entry.handle,
      ...(deduplication.ttl === undefined ? {} : { expiresAt: Date.now() + deduplication.ttl }),
    })
    this.#deduplication.set(entry.options.queue, reservations)
    if (deduplication.ttl !== undefined) this.#scheduleDeduplicationExpiry(Date.now() + deduplication.ttl)
  }

  #releaseDeduplication(entry: PendingJob): void {
    const deduplication = entry.options.deduplication
    if (!deduplication || deduplication.ttl !== undefined) return
    const reservations = this.#deduplication.get(entry.options.queue)
    if (reservations?.get(deduplication.id)?.handle !== entry.handle) return
    reservations.delete(deduplication.id)
    if (reservations.size === 0) this.#deduplication.delete(entry.options.queue)
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

  #removePending(entry: PendingJob): boolean {
    const jobs = this.#pending.get(entry.options.queue)
    if (!jobs) return false
    const index = jobs.indexOf(entry)
    if (index < 0) return false
    jobs.splice(index, 1)
    if (jobs.length === 0) this.#pending.delete(entry.options.queue)
    return true
  }
}

function resolveOptions(job: Job, options?: PushOptions): ResolvedOptions {
  const config = job.constructor as typeof Job
  if (options?.id?.startsWith(QUEUE_CHAIN_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue chain prefix')
  if (options?.id?.startsWith(QUEUE_BATCH_JOB_ID_PREFIX)) throw new TypeError('job id uses the reserved queue batch prefix')
  if (options?.id !== undefined && options.deduplication !== undefined) throw new TypeError('id and deduplication cannot be combined')
  const deduplication = normalizeDeduplication(options?.deduplication)
  return {
    ...(options?.id ? { id: options.id } : {}),
    tries: integer(options?.tries ?? config.tries, 'tries', 1, 1000),
    delay: integer(options?.delay ?? config.delay, 'delay', 0, 86_400_000),
    queue: options?.queue ?? config.queue,
    backoff: validateBackoff(options?.backoff ?? config.backoff),
    priority: integer(options?.priority ?? config.priority, 'priority', 0, MAX_JOB_PRIORITY),
    ...(deduplication ? { deduplication } : {}),
  }
}

function resolveBackoff(backoff: number | readonly number[], attempt: number): number {
  if (typeof backoff === 'number') return integer(backoff, 'backoff', 0, 86_400_000)
  return integer(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0, 'backoff', 0, 86_400_000)
}
function integer(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`)
  return value
}
function validateBackoff(backoff: number | readonly number[]): number | readonly number[] {
  const values = typeof backoff === 'number' ? [backoff] : backoff
  for (const value of values) integer(value, 'backoff', 0, 86_400_000)
  return backoff
}
