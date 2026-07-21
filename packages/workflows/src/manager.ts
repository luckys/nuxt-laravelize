import type { WorkflowRegistry } from './definition'
import { LeaseConflictError, RevisionConflictError, type WorkflowStore } from './store'
import { isWorkflowTerminal, isWorkflowWaiting, workflowNextRetryAt } from './state'
/* eslint-disable @stylistic/max-statements-per-line */
import type { Clock, JsonValue, RetrySchedule, WorkflowDefinition, WorkflowError, WorkflowSnapshot } from './types'

export interface WorkflowManagerOptions { clock?: Clock, retrySchedule?: RetrySchedule, leaseDurationMs?: number, idFactory?: () => string, tokenFactory?: () => string }

const systemClock: Clock = { now: () => Date.now() }
const defaultRetry: RetrySchedule = attempt => Math.min(60_000, 1000 * 2 ** (attempt - 1))
export type WorkflowProcessResult
  = | { outcome: 'processed', snapshot: WorkflowSnapshot }
    | { outcome: 'waiting', snapshot: WorkflowSnapshot, retryAt: number }
    | { outcome: 'terminal', snapshot: WorkflowSnapshot }
    | { outcome: 'contended', snapshot: WorkflowSnapshot }

export class WorkflowManager {
  private readonly clock: Clock
  private readonly retrySchedule: RetrySchedule
  private readonly leaseDurationMs: number
  private readonly idFactory: () => string
  private readonly tokenFactory: () => string

  constructor(private readonly store: WorkflowStore, private readonly registry: WorkflowRegistry, options: WorkflowManagerOptions = {}) {
    this.clock = options.clock ?? systemClock
    this.retrySchedule = options.retrySchedule ?? defaultRetry
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID())
    this.tokenFactory = options.tokenFactory ?? (() => crypto.randomUUID())
  }

  async start<I extends JsonValue>(reference: WorkflowDefinition<I>, input: I, startKey: string): Promise<WorkflowSnapshot> {
    if (!startKey) throw new TypeError('A non-empty start key is required')
    assertJsonSafe(input)
    const definition = this.registry.get(reference.name, reference.version) as WorkflowDefinition<I>
    const now = this.clock.now()
    const id = this.idFactory()
    const snapshot: WorkflowSnapshot = {
      id, workflowName: definition.name, workflowVersion: definition.version, startKey,
      canonicalInput: canonicalize(input), input, state: 'pending', revision: 0,
      cancellationRequested: false, createdAt: now, updatedAt: now,
      steps: definition.steps.map((step, index) => ({ name: step.name, state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: `${id}:step:${index}`, ...(step.compensate ? { compensationIdempotencyKey: `${id}:compensate:${index}` } : {}) })),
    }
    return (await this.store.create(snapshot)).snapshot
  }

  async status(id: string) { return this.store.get(id) }

  async cancel(id: string): Promise<WorkflowSnapshot> {
    const snapshot = await this.required(id)
    if (isWorkflowTerminal(snapshot) || snapshot.cancellationRequested) return snapshot
    return this.store.requestCancellation(id, snapshot.revision, this.clock.now())
  }

  /** Processes at most one handler attempt (plus its persisted boundaries). */
  async process(id: string): Promise<WorkflowSnapshot> {
    return (await this.processResult(id)).snapshot
  }

  /** Processes at most one authoritative transition and reports why processing stopped. */
  async processResult(id: string): Promise<WorkflowProcessResult> {
    const observed = await this.required(id)
    if (isWorkflowTerminal(observed)) return { outcome: 'terminal', snapshot: observed }
    const now = this.clock.now()
    const retryAt = workflowNextRetryAt(observed)
    if (isWorkflowWaiting(observed) && retryAt !== null && retryAt > now) return { outcome: 'waiting', snapshot: observed, retryAt }
    const token = this.tokenFactory()
    let claimed: WorkflowSnapshot
    try { claimed = await this.store.claim(id, observed.revision, token, now, now + this.leaseDurationMs) }
    catch (error) {
      if (error instanceof RevisionConflictError || error instanceof LeaseConflictError) return this.classifyClaimConflict(await this.required(id))
      throw error
    }
    const definition = this.registry.get(claimed.workflowName, claimed.workflowVersion)
    return { outcome: 'processed', snapshot: await this.advance(claimed, definition, token) }
  }

  async run(id: string, maxTransitions = 100): Promise<WorkflowSnapshot> {
    let snapshot = await this.required(id)
    for (let count = 0; count < maxTransitions && !isWorkflowTerminal(snapshot); count++) {
      const before = snapshot.revision
      snapshot = await this.process(id)
      if (snapshot.revision === before || isWorkflowWaiting(snapshot)) break
    }
    return snapshot
  }

  private async advance(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string) {
    if (snapshot.cancellationRequested && !isCompensating(snapshot)) return this.commit(snapshot, token, this.beginCompensationOrCancel(snapshot, definition))
    return isCompensating(snapshot) ? this.compensate(snapshot, definition, token) : this.execute(snapshot, definition, token)
  }

  private async execute(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string) {
    const index = snapshot.steps.findIndex(step => step.state !== 'committed')
    if (index < 0) return this.commit(snapshot, token, { ...snapshot, state: 'completed' })
    if (snapshot.steps[index]!.state === 'running') return this.interruptedForward(snapshot, definition, token, index)
    const step = definition.steps[index]!
    const steps = snapshot.steps.map(value => ({ ...value }))
    const current = steps[index]!
    current.state = 'running'; current.attempts++; current.retryAt = undefined; current.error = undefined
    const started = await this.commit(snapshot, token, { ...snapshot, steps, state: 'running' }, false)
    try {
      const output = await step.run({ workflowId: started.id, input: started.input, previousOutput: index ? started.steps[index - 1]?.output : undefined, idempotencyKey: current.idempotencyKey, attempt: current.attempts })
      assertJsonSafe(output, 'Workflow step output')
      current.output = output; current.state = 'committed'
      // Completion is a separate transition so a cancellation racing this effect is observed and compensated.
      return this.commit(started, token, { ...started, steps, state: 'running' })
    }
    catch (error) { return this.finishForwardFailure(started, definition, token, index, steps, error) }
  }

  private finishForwardFailure(started: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number, steps: WorkflowSnapshot['steps'], error: unknown) {
    const current = steps[index]!
    const step = definition.steps[index]!
    current.error = serializeError(error)
    const delay = current.attempts < step.maxAttempts ? this.retrySchedule(current.attempts, error, 'step') : null
    if (delay !== null) { current.state = 'waiting_retry'; current.retryAt = this.clock.now() + Math.max(0, delay); return this.commit(started, token, { ...started, steps, state: 'waiting_retry' }) }
    current.state = 'failed'
    return this.commit(started, token, this.beginCompensationOrCancel({ ...started, steps, state: 'failed' }, definition, false))
  }

  private interruptedForward(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number) {
    const error = new Error('Previous step attempt was interrupted before its result was committed')
    return this.finishForwardFailure(snapshot, definition, token, index, snapshot.steps.map(value => ({ ...value })), error)
  }

  private async compensate(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string) {
    let index = -1
    for (let cursor = snapshot.steps.length - 1; cursor >= 0; cursor--) {
      const state = snapshot.steps[cursor]!.state
      if ((state === 'committed' || state === 'compensation_waiting_retry' || state === 'compensating') && definition.steps[cursor]?.compensate) { index = cursor; break }
    }
    if (index < 0) return this.commit(snapshot, token, { ...snapshot, state: snapshot.cancellationRequested ? 'cancelled' : 'compensated' })
    if (snapshot.steps[index]!.state === 'compensating') return this.interruptedCompensation(snapshot, definition, token, index)
    const steps = snapshot.steps.map(value => ({ ...value }))
    const current = steps[index]!
    const step = definition.steps[index]!
    current.state = 'compensating'; current.compensationAttempts++; current.retryAt = undefined; current.error = undefined
    const started = await this.commit(snapshot, token, { ...snapshot, steps, state: 'compensating' }, false)
    try {
      await step.compensate!({ workflowId: started.id, input: started.input, previousOutput: index ? started.steps[index - 1]?.output : undefined, stepOutput: current.output!, idempotencyKey: current.compensationIdempotencyKey!, attempt: current.compensationAttempts })
      current.state = 'compensated'
      return this.commit(started, token, { ...started, steps, state: 'compensating' })
    }
    catch (error) { return this.finishCompensationFailure(started, definition, token, index, steps, error) }
  }

  private finishCompensationFailure(started: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number, steps: WorkflowSnapshot['steps'], error: unknown) {
    const current = steps[index]!
    const step = definition.steps[index]!
    current.error = serializeError(error)
    const delay = current.compensationAttempts < step.maxAttempts ? this.retrySchedule(current.compensationAttempts, error, 'compensation') : null
    if (delay !== null) { current.state = 'compensation_waiting_retry'; current.retryAt = this.clock.now() + Math.max(0, delay); return this.commit(started, token, { ...started, steps, state: 'compensation_waiting_retry' }) }
    current.state = 'compensation_failed'
    return this.commit(started, token, { ...started, steps, state: 'compensation_failed' })
  }

  private interruptedCompensation(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number) {
    const error = new Error('Previous compensation attempt was interrupted before its result was committed')
    return this.finishCompensationFailure(snapshot, definition, token, index, snapshot.steps.map(value => ({ ...value })), error)
  }

  private beginCompensationOrCancel(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, cancellation = true): WorkflowSnapshot {
    const hasCompensation = snapshot.steps.some((step, index) => step.state === 'committed' && definition.steps[index]?.compensate)
    return { ...snapshot, state: hasCompensation ? 'compensating' : cancellation ? 'cancelled' : 'failed' }
  }

  private commit(original: WorkflowSnapshot, token: string, next: WorkflowSnapshot, releaseLease = true) {
    const now = this.clock.now()
    return this.store.commit({ ...next, updatedAt: now }, original.revision, token, now, releaseLease)
  }

  private async required(id: string) { const snapshot = await this.store.get(id); if (!snapshot) throw new Error(`Workflow not found: ${id}`); return snapshot }

  private classifyClaimConflict(snapshot: WorkflowSnapshot): WorkflowProcessResult {
    if (isWorkflowTerminal(snapshot)) return { outcome: 'terminal', snapshot }
    const retryAt = workflowNextRetryAt(snapshot)
    if (isWorkflowWaiting(snapshot) && retryAt !== null) return { outcome: 'waiting', snapshot, retryAt }
    return { outcome: 'contended', snapshot }
  }
}

function isCompensating(snapshot: WorkflowSnapshot) { return snapshot.state === 'compensating' || snapshot.state === 'compensation_waiting_retry' }
function serializeError(error: unknown): WorkflowError { return error instanceof Error ? { name: error.name, message: error.message } : { name: 'Error', message: String(error) } }

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key]!)}`).join(',')}}`
}

function assertJsonSafe(value: unknown, subject = 'Workflow input', seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError(`${subject} must contain only finite JSON numbers`); return }
  if (typeof value !== 'object') throw new TypeError(`${subject} must be JSON-safe`)
  if (seen.has(value)) throw new TypeError(`${subject} must not be circular`)
  seen.add(value)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${subject} must contain only arrays and plain objects`)
  for (const item of Array.isArray(value) ? value : Object.values(value)) assertJsonSafe(item, subject, seen)
  seen.delete(value)
}
