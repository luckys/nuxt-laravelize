import type { Job } from '../../../queue/Job'
import type { JobHandle, PushOptions, Queue } from '../../../queue/Queue'

interface PushedEntry {
  readonly job: Job
  readonly options: PushOptions | undefined
}

export class FakeQueue implements Queue {
  readonly pushed: PushedEntry[] = []
  #nextId = 1

  async push(job: Job, options?: PushOptions): Promise<JobHandle> {
    this.pushed.push({ job, options })
    const queueName = options?.queue ?? (job.constructor as { queue?: string }).queue ?? 'default'
    return { id: `fake-${this.#nextId++}`, queue: queueName }
  }

  async later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle> {
    return this.push(job, { ...options, delay: delayMs })
  }

  async size(queueName?: string): Promise<number> {
    if (queueName === undefined) return this.pushed.length
    return this.pushed.filter((p) => (p.options?.queue ?? (p.job.constructor as { queue?: string }).queue) === queueName).length
  }

  async clear(queueName?: string): Promise<void> {
    if (queueName === undefined) {
      this.pushed.length = 0
      return
    }
    for (let i = this.pushed.length - 1; i >= 0; i -= 1) {
      const entry = this.pushed[i]!
      const q = entry.options?.queue ?? (entry.job.constructor as { queue?: string }).queue
      if (q === queueName) this.pushed.splice(i, 1)
    }
  }

  reset(): void { this.pushed.length = 0 }

  assertQueued<J extends Job>(
    jobClass: new (...args: never[]) => J,
    matcher?: (job: J) => boolean,
  ): void {
    const matches = this.pushed.filter((e) => e.job instanceof jobClass) as Array<PushedEntry & { job: J }>
    if (matches.length === 0) {
      throw new Error(`Expected a job of type ${jobClass.name} to be queued, none were.`)
    }
    if (matcher !== undefined && !matches.some((m) => matcher(m.job))) {
      throw new Error(`Queued ${jobClass.name} jobs did not match the predicate.`)
    }
  }

  assertNothingQueued(): void {
    if (this.pushed.length > 0) {
      throw new Error(`Expected no jobs queued, but got ${this.pushed.length}.`)
    }
  }
}
