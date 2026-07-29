import type { Job } from '../Job'
import { MAX_JOB_PRIORITY, type FailedJobCallback, type JobHandle, type PushOptions, type Queue } from '../Queue'

export interface PushedJob { readonly job: Job, readonly options: PushOptions, readonly priority: number }

export class QueueFake implements Queue {
  readonly pushed: PushedJob[] = []
  async push(job: Job, options: PushOptions = {}): Promise<JobHandle> {
    const priority = options.priority ?? (job.constructor as typeof Job).priority
    if (!Number.isSafeInteger(priority) || priority < 0 || priority > MAX_JOB_PRIORITY) throw new TypeError(`priority must be an integer between 0 and ${MAX_JOB_PRIORITY}`)
    this.pushed.push({ job, options, priority })
    return { id: options.id ?? `fake-${this.pushed.length}`, queue: options.queue ?? (job.constructor as typeof Job).queue }
  }

  later(delay: number, job: Job, options: PushOptions = {}): Promise<JobHandle> { return this.push(job, { ...options, delay }) }
  async sync(_job: Job): Promise<void> {}
  async size(queue?: string): Promise<number> { return queue ? this.pushed.filter(item => item.options.queue === queue).length : this.pushed.length }
  async clear(queue?: string): Promise<void> {
    if (!queue) this.pushed.length = 0
    else this.pushed.splice(0, this.pushed.length, ...this.pushed.filter(item => item.options.queue !== queue))
  }

  onFailed(_callback: FailedJobCallback): void {}
  assertPushed<T extends Job>(type: new (...args: never[]) => T): void {
    if (!this.pushed.some(item => item.job instanceof type)) throw new Error(`Expected ${type.name} to be pushed.`)
  }
}
