import { JobSerializer, type Job, type SerializedJob } from './Job'
import type { JobRunner } from './JobRunner'
import type { FailedJobCallback, JobHandle, PushOptions, Queue } from './Queue'
import { isNonRetryableJobError, NonRetryableJobError } from './NonRetryableJobError'
import { isJobReleasedError } from './JobReleasedError'

interface ResolvedOptions {
  readonly id?: string
  readonly tries: number
  readonly delay: number
  readonly queue: string
  readonly backoff: number | readonly number[]
}

interface PendingJob {
  readonly original: Job
  readonly serialized: SerializedJob
  readonly options: ResolvedOptions
  readonly handle: JobHandle
  attempt: number
  releases: number
}

export class InMemoryQueue implements Queue {
  readonly #pending = new Map<string, PendingJob[]>()
  readonly #timers = new Map<ReturnType<typeof setTimeout>, PendingJob>()
  readonly #failedCallbacks: FailedJobCallback[] = []
  #nextId = 1

  constructor(private readonly runner: JobRunner, private readonly serializer: JobSerializer = new JobSerializer()) {}

  async push(job: Job, options?: PushOptions): Promise<JobHandle> {
    const resolved = resolveOptions(job, options)
    const entry: PendingJob = {
      original: job,
      serialized: this.serializer.serialize(job),
      options: resolved,
      handle: { id: resolved.id ?? `memory-${this.#nextId++}`, queue: resolved.queue },
      attempt: 0,
      releases: 0,
    }
    this.#enqueue(entry, resolved.delay)
    return entry.handle
  }

  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle> {
    return this.push(job, { ...options, delay: delayMs })
  }

  sync(job: Job): Promise<void> { return this.runner.run(this.serializer.serialize(job)) }

  async size(queueName?: string): Promise<number> {
    if (queueName) return this.#pending.get(queueName)?.length ?? 0
    return [...this.#pending.values()].reduce((total, jobs) => total + jobs.length, 0)
  }

  async clear(queueName?: string): Promise<void> {
    if (queueName) this.#pending.delete(queueName)
    else this.#pending.clear()
    for (const [timer, entry] of this.#timers) {
      if (!queueName || entry.options.queue === queueName) {
        clearTimeout(timer)
        this.#timers.delete(timer)
      }
    }
  }

  onFailed(callback: FailedJobCallback): void { this.#failedCallbacks.push(callback) }

  #enqueue(entry: PendingJob, delay: number): void {
    const jobs = this.#pending.get(entry.options.queue) ?? []
    jobs.push(entry)
    this.#pending.set(entry.options.queue, jobs)
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.#timers.delete(timer)
        this.#schedule(entry)
      }, delay)
      this.#timers.set(timer, entry)
      return
    }
    this.#schedule(entry)
  }

  #schedule(entry: PendingJob): void {
    queueMicrotask(() => void this.#run(entry))
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
        failure = new NonRetryableJobError('JOB_RELEASE_LIMIT_EXCEEDED', 'Job exceeded its delayed release budget')
      }
      if (!isNonRetryableJobError(failure) && entry.attempt < entry.options.tries) {
        this.#enqueue(entry, resolveBackoff(entry.options.backoff, entry.attempt))
        return
      }
      try {
        await this.runner.failed(entry.serialized, failure, { queue: entry.options.queue, attempt: entry.attempt, maxAttempts: entry.options.tries })
      }
      catch {
        // A job failure callback is an isolated observer of the original failure.
      }
      for (const callback of this.#failedCallbacks) {
        try {
          await callback({ job: entry.original, queue: entry.options.queue, error: failure, attempts: entry.attempt })
        }
        catch { /* Failure observers cannot alter queue completion. */ }
      }
    }
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
  return {
    ...(options?.id ? { id: options.id } : {}),
    tries: integer(options?.tries ?? config.tries, 'tries', 1, 1000),
    delay: integer(options?.delay ?? config.delay, 'delay', 0, 86_400_000),
    queue: options?.queue ?? config.queue,
    backoff: validateBackoff(options?.backoff ?? config.backoff),
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
