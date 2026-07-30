import { JobSerializer, type Job, type SerializedJob } from './Job'
import type { JobRunner } from './JobRunner'
import { MAX_JOB_PRIORITY, normalizeDeduplication, type FailedJobCallback, type JobDeduplicationOptions, type JobHandle, type PushOptions, type Queue } from './Queue'
import { isNonRetryableJobError, NonRetryableJobError } from './NonRetryableJobError'
import { isJobReleasedError } from './JobReleasedError'

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
}

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
  #deduplicationTimer?: ReturnType<typeof setTimeout>
  #deduplicationTimerDueAt?: number
  #nextId = 1
  #nextSequence = 1

  constructor(private readonly runner: JobRunner, private readonly serializer: JobSerializer = new JobSerializer()) {}

  async push(job: Job, options?: PushOptions): Promise<JobHandle> {
    const resolved = resolveOptions(job, options)
    const serialized = this.serializer.serialize(job)
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

  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle> {
    return this.push(job, { ...options, delay: delayMs })
  }

  sync(job: Job): Promise<void> { return this.runner.run(this.serializer.serialize(job)) }

  async size(queueName?: string): Promise<number> {
    if (queueName !== undefined) return this.#pending.get(queueName)?.length ?? 0
    return [...this.#pending.values()].reduce((total, jobs) => total + jobs.length, 0)
  }

  async clear(queueName?: string): Promise<void> {
    if (queueName !== undefined) {
      this.#pending.delete(queueName)
      this.#deduplication.delete(queueName)
    }
    else {
      this.#pending.clear()
      this.#deduplication.clear()
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
    entry.attempt += 1
    try {
      await this.runner.run(entry.serialized, { queue: entry.options.queue, attempt: entry.attempt, maxAttempts: entry.options.tries })
    }
    catch (error) {
      let failure = error
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
    }
    this.#releaseDeduplication(entry)
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
