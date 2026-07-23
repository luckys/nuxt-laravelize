import type { DeadLetterDetail, DeadLetterDisposition, DeadLetterKey, DeadLetterMutationResult, DeadLetterSummary } from '@nuxt-laravelize/dead-letter'

export type { DeadLetterDetail, DeadLetterDisposition, DeadLetterKey, DeadLetterMutationResult, DeadLetterSummary }
export interface OperationsFiltersValue { source: string, namespace: string, type: string, disposition: '' | DeadLetterDisposition }
export interface RetryInput { availableAt: string, reason: string }
export interface OperationsProblem { code: string, message: string, ambiguous?: boolean }
export interface DeadLetterCapabilities { viewPayload: boolean, viewErrorSummary: boolean, retry: boolean, discard: boolean, scheduleRetry: boolean, retryInbox: boolean }
export interface DeadLetterOperationsDetail extends DeadLetterDetail { capabilities: DeadLetterCapabilities }
export interface PendingDeadLetterMutation {
  readonly action: 'retry' | 'discard'
  readonly key: DeadLetterKey
  readonly revision: string
  readonly input: RetryInput | { reason: string }
  readonly operationId: string
}
