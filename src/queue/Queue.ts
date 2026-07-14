import type { Job } from './Job'

export interface PushOptions {
  tries?: number
  delay?: number
  queue?: string
  backoff?: number
}

export interface JobHandle {
  id: string
  queue: string
}

export interface FailedJobInfo {
  job: Job
  queue: string
  error: unknown
  attempts: number
}

export type FailedJobCallback = (info: FailedJobInfo) => void

export interface Queue {
  push(job: Job, options?: PushOptions): Promise<JobHandle>
  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle>
  sync(job: Job): Promise<void>
  size(queueName?: string): Promise<number>
  clear(queueName?: string): Promise<void>
  onFailed(callback: FailedJobCallback): void
}
