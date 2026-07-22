export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type WorkflowState
  = | 'pending' | 'running' | 'waiting_retry' | 'completed' | 'failed'
    | 'compensating' | 'compensation_waiting_retry' | 'compensated'
    | 'compensation_failed' | 'cancelled'

export interface WorkflowError {
  name: string
  message: string
}

export interface StepSnapshot {
  name: string
  state: 'pending' | 'running' | 'waiting_retry' | 'committed' | 'compensating' | 'compensation_waiting_retry' | 'compensated' | 'failed' | 'compensation_failed'
  attempts: number
  compensationAttempts: number
  idempotencyKey: string
  compensationIdempotencyKey?: string
  output?: JsonValue
  retryAt?: number
  error?: WorkflowError
}

export interface WorkflowLease { token: string, expiresAt: number }

export interface WorkflowSnapshot {
  id: string
  workflowName: string
  workflowVersion: string
  startKey: string
  canonicalInput: string
  input: JsonValue
  state: WorkflowState
  revision: number
  steps: StepSnapshot[]
  lease?: WorkflowLease
  cancellationRequested: boolean
  createdAt: number
  updatedAt: number
}

export interface StepContext<I extends JsonValue = JsonValue> {
  workflowId: string
  input: I
  previousOutput: JsonValue | undefined
  idempotencyKey: string
  attempt: number
  readonly signal: AbortSignal
}

export interface CompensationContext<I extends JsonValue = JsonValue> extends StepContext<I> {
  stepOutput: JsonValue
}

export interface WorkflowStep<I extends JsonValue = JsonValue> {
  name: string
  run(context: StepContext<I>): Promise<JsonValue> | JsonValue
  compensate?: (context: CompensationContext<I>) => Promise<void> | void
  maxAttempts: number
}

export interface WorkflowDefinition<I extends JsonValue = JsonValue> {
  name: string
  version: string
  steps: readonly WorkflowStep<I>[]
}

export interface Clock { now(): number }
export type RetrySchedule = (attempt: number, error: unknown, phase: 'step' | 'compensation') => number | null
