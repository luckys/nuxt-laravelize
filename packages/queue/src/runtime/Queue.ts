import type { Job } from './Job'

export interface PushOptions {
  readonly id?: string
  readonly tries?: number
  readonly delay?: number
  readonly queue?: string
  readonly backoff?: number | readonly number[]
}

export interface JobHandle { readonly id: string, readonly queue: string }
export interface FailedJobInfo { readonly job: Job, readonly queue: string, readonly error: unknown, readonly attempts: number }
export type FailedJobCallback = (info: FailedJobInfo) => void | Promise<void>

export interface Queue {
  push(job: Job, options?: PushOptions): Promise<JobHandle>
  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle>
  sync(job: Job): Promise<void>
  size(queueName?: string): Promise<number>
  clear(queueName?: string): Promise<void>
  onFailed(callback: FailedJobCallback): void
}
