import { JobSerializer, readJobDispatchIdentity, readJobTags, type Job, type JobDispatchIdentityV1, type SerializedJob } from '../Job'
import { MAX_JOB_PRIORITY, normalizeDeduplication, type FailedJobCallback, type JobHandle, type PushOptions, type Queue } from '../Queue'

export interface PushedJob { readonly job: Job, readonly options: PushOptions, readonly priority: number, readonly queue?: string, readonly tags: readonly string[], readonly dispatch: JobDispatchIdentityV1, readonly serialized: SerializedJob }

export class QueueFake implements Queue {
  readonly pushed: PushedJob[] = []
  readonly #deduplication = new Map<string, Map<string, { readonly handle: JobHandle, readonly expiresAt?: number }>>()
  readonly #serializer = new JobSerializer()
  #nextId = 1
  #deduplicationTimer?: ReturnType<typeof setTimeout>
  #deduplicationTimerDueAt?: number
  async push(job: Job, options: PushOptions = {}): Promise<JobHandle> {
    if (options.id !== undefined && options.deduplication !== undefined) throw new TypeError('id and deduplication cannot be combined')
    const priority = options.priority ?? (job.constructor as typeof Job).priority
    if (!Number.isSafeInteger(priority) || priority < 0 || priority > MAX_JOB_PRIORITY) throw new TypeError(`priority must be an integer between 0 and ${MAX_JOB_PRIORITY}`)
    const queue = options.queue ?? (job.constructor as typeof Job).queue
    const serialized = this.#serializer.serialize(job)
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

  later(delay: number, job: Job, options: PushOptions = {}): Promise<JobHandle> { return this.push(job, { ...options, delay }) }
  async sync(job: Job): Promise<void> { this.#serializer.serialize(job) }
  async size(queue?: string): Promise<number> { return queue === undefined ? this.pushed.length : this.pushed.filter(item => item.queue === queue).length }
  async clear(queue?: string): Promise<void> {
    if (queue === undefined) {
      this.pushed.length = 0
      this.#deduplication.clear()
      this.#clearDeduplicationTimer()
    }
    else {
      this.pushed.splice(0, this.pushed.length, ...this.pushed.filter(item => item.queue !== queue))
      this.#deduplication.delete(queue)
      this.#rescheduleDeduplicationExpiry()
    }
  }

  onFailed(_callback: FailedJobCallback): void {}
  assertPushed<T extends Job>(type: new (...args: never[]) => T): void {
    if (!this.pushed.some(item => item.job instanceof type)) throw new Error(`Expected ${type.name} to be pushed.`)
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
