import { JobSerializer, type Job, type SerializedJob } from './Job'
import type { JobRunner } from './JobRunner'
import type { FailedJobCallback, JobHandle, PushOptions, Queue } from './Queue'

interface ResolvedOptions {
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
      handle: { id: `memory-${this.#nextId++}`, queue: resolved.queue },
      attempt: 0,
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
      await this.runner.run(entry.serialized)
    }
    catch (error) {
      if (entry.attempt < entry.options.tries) {
        this.#enqueue(entry, resolveBackoff(entry.options.backoff, entry.attempt))
        return
      }
      await this.runner.failed(entry.serialized, error)
      for (const callback of this.#failedCallbacks) {
        try {
          await callback({ job: entry.original, queue: entry.options.queue, error, attempts: entry.attempt })
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
    tries: Math.max(options?.tries ?? config.tries, 1),
    delay: Math.max(options?.delay ?? config.delay, 0),
    queue: options?.queue ?? config.queue,
    backoff: options?.backoff ?? config.backoff,
  }
}

function resolveBackoff(backoff: number | readonly number[], attempt: number): number {
  if (typeof backoff === 'number') return Math.max(backoff, 0)
  return Math.max(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0, 0)
}
