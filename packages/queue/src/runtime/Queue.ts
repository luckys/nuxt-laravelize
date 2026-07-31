import type { Job } from './Job'
import type { QueueBatchHandle, QueueBatchItem, QueueBatchOptions, QueueBatchSnapshot } from './QueueBatch'

export const MAX_JOB_PRIORITY = 2 ** 21
const MAX_DEDUPLICATION_TTL = 86_400_000
const DEDUPLICATION_ID = /^[A-Z0-9][\w.:-]{0,255}$/i

export interface JobDeduplicationOptions {
  readonly id: string
  readonly ttl?: number
}

export interface PushOptions {
  readonly id?: string
  readonly tries?: number
  readonly delay?: number
  readonly queue?: string
  readonly backoff?: number | readonly number[]
  readonly priority?: number
  readonly deduplication?: JobDeduplicationOptions
}

export type QueueChainStepOptions = Omit<PushOptions, 'id' | 'deduplication'>
export interface QueueChainStep { readonly job: Job, readonly options?: QueueChainStepOptions }

export interface JobHandle { readonly id: string, readonly queue: string }
export interface FailedJobInfo { readonly job: Job, readonly queue: string, readonly error: unknown, readonly attempts: number }
export type FailedJobCallback = (info: FailedJobInfo) => void | Promise<void>

export interface Queue {
  push(job: Job, options?: PushOptions): Promise<JobHandle>
  chain(steps: readonly QueueChainStep[]): Promise<JobHandle>
  batch(items: readonly QueueBatchItem[], options?: QueueBatchOptions): Promise<QueueBatchHandle>
  batchStatus(handle: QueueBatchHandle): Promise<QueueBatchSnapshot>
  cancelBatch(handle: QueueBatchHandle): Promise<QueueBatchSnapshot>
  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle>
  sync(job: Job): Promise<void>
  size(queueName?: string): Promise<number>
  clear(queueName?: string): Promise<void>
  onFailed(callback: FailedJobCallback): void
}

export function normalizeDeduplication(value?: JobDeduplicationOptions): JobDeduplicationOptions | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'id' && key !== 'ttl')) {
    throw new TypeError('deduplication must contain only id and optional ttl')
  }
  if (typeof value.id !== 'string' || !DEDUPLICATION_ID.test(value.id)) {
    throw new TypeError('deduplication id must be a safe identifier of at most 256 characters')
  }
  if (value.ttl !== undefined && (!Number.isSafeInteger(value.ttl) || value.ttl < 1 || value.ttl > MAX_DEDUPLICATION_TTL)) {
    throw new TypeError(`deduplication ttl must be an integer between 1 and ${MAX_DEDUPLICATION_TTL}`)
  }
  return { id: value.id, ...(value.ttl === undefined ? {} : { ttl: value.ttl }) }
}
