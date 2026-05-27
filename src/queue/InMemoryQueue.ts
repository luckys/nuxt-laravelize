import type { Resolver } from '../core/container/Container'
import { loggerFor } from '../logging/loggerFor'

import type { Job } from './Job'
import type { JobRegistry } from './JobRegistry'
import { ListenerJob } from './ListenerJob'
import type { JobHandle, PushOptions, Queue } from './Queue'

interface PendingEntry {
  job: Job
  options: ResolvedOptions
  attemptsLeft: number
  handle: JobHandle
}

interface ResolvedOptions {
  tries: number
  delay: number
  queue: string
  backoff: number
}

interface JobStaticConfig {
  tries: number
  delay: number
  queue: string
  backoff: number
}

function readStatics(job: Job): JobStaticConfig {
  const ctor = job.constructor as unknown as JobStaticConfig
  return { tries: ctor.tries, delay: ctor.delay, queue: ctor.queue, backoff: ctor.backoff }
}

function resolveOptions(job: Job, options: PushOptions | undefined): ResolvedOptions {
  const statics = readStatics(job)
  return {
    tries: Math.max(options?.tries ?? statics.tries, 1),
    delay: options?.delay ?? statics.delay,
    queue: options?.queue ?? statics.queue,
    backoff: options?.backoff ?? statics.backoff,
  }
}

export class InMemoryQueue implements Queue {
  readonly #pending = new Map<string, PendingEntry[]>()
  readonly #scheduled = new Set<ReturnType<typeof setTimeout>>()
  readonly #resolver: Resolver | null
  readonly #registry: JobRegistry | null
  #nextId = 1

  constructor(resolver?: Resolver, registry?: JobRegistry) {
    this.#resolver = resolver ?? null
    this.#registry = registry ?? null
  }

  push(job: Job, options?: PushOptions): Promise<JobHandle> {
    const resolved = resolveOptions(job, options)
    const handle: JobHandle = { id: `mem-${this.#nextId++}`, queue: resolved.queue }
    const entry: PendingEntry = { job, options: resolved, attemptsLeft: resolved.tries, handle }

    if (resolved.delay > 0) {
      this.#enqueuePendingForCounting(entry)
      const timer = setTimeout(() => {
        this.#scheduled.delete(timer)
        this.#removeFromPending(entry)
        this.#enqueueAndDrain(entry)
      }, resolved.delay)
      this.#scheduled.add(timer)
      return Promise.resolve(handle)
    }

    this.#enqueuePendingForCounting(entry)
    const result = Promise.resolve(handle)
    void result.then(() => this.#dequeueAndScheduleRun(resolved.queue))
    return result
  }

  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle> {
    return this.push(job, { ...options, delay: delayMs })
  }

  async size(queueName?: string): Promise<number> {
    if (queueName === undefined) {
      let total = 0
      for (const list of this.#pending.values()) total += list.length
      return total
    }
    return this.#pending.get(queueName)?.length ?? 0
  }

  async clear(queueName?: string): Promise<void> {
    if (queueName === undefined) {
      this.#pending.clear()
      return
    }
    this.#pending.delete(queueName)
  }

  #enqueuePendingForCounting(entry: PendingEntry): void {
    const list = this.#pending.get(entry.options.queue) ?? []
    list.push(entry)
    this.#pending.set(entry.options.queue, list)
  }

  #removeFromPending(entry: PendingEntry): void {
    const list = this.#pending.get(entry.options.queue)
    if (!list) return
    const idx = list.indexOf(entry)
    if (idx >= 0) list.splice(idx, 1)
    if (list.length === 0) this.#pending.delete(entry.options.queue)
  }

  #enqueueAndDrain(entry: PendingEntry): void {
    this.#enqueuePendingForCounting(entry)
    void Promise.resolve().then(() => this.#dequeueAndScheduleRun(entry.options.queue))
  }

  #dequeueAndScheduleRun(queueName: string): void {
    const list = this.#pending.get(queueName)
    if (!list || list.length === 0) return

    const entry = list.shift()
    if (!entry) return
    if (list.length === 0) this.#pending.delete(queueName)

    queueMicrotask(() => void this.#runEntry(entry, queueName))
  }

  async #runEntry(entry: PendingEntry, queueName: string): Promise<void> {
    try {
      if (entry.job instanceof ListenerJob && this.#resolver && this.#registry) {
        await entry.job.handle(this.#resolver, this.#registry)
        return
      }
      await entry.job.handle()
    }
    catch (error) {
      entry.attemptsLeft -= 1
      if (entry.attemptsLeft <= 0) {
        loggerFor(this.#resolver).error('queue job failed', {
          queue: queueName,
          jobName: entry.job.constructor.name,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
        })
        return
      }
      const retry = (): void => {
        this.#enqueuePendingForCounting(entry)
        void Promise.resolve().then(() => this.#dequeueAndScheduleRun(queueName))
      }
      if (entry.options.backoff > 0) {
        const timer = setTimeout(() => {
          this.#scheduled.delete(timer)
          retry()
        }, entry.options.backoff)
        this.#scheduled.add(timer)
        return
      }
      retry()
    }
  }
}
