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

export interface Queue {
  push(job: Job, options?: PushOptions): Promise<JobHandle>
  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle>
  size(queueName?: string): Promise<number>
  clear(queueName?: string): Promise<void>
}
