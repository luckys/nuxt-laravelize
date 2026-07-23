import { LeaseConflictError, RevisionConflictError, WorkflowExecutionAbortedError, WorkflowLeaseLostError, type WorkflowStore } from './store'
import { isWorkflowTerminal, isWorkflowWaiting, workflowNextRetryAt } from './state'
/* eslint-disable @stylistic/max-statements-per-line */
import type { Clock, JsonValue, RetrySchedule, WorkflowDefinition, WorkflowDefinitionReference, WorkflowDefinitionResolver, WorkflowError, WorkflowSnapshot } from './types'
import { assertWorkflowCancellationReceipt, assertWorkflowClaimReceipt, assertWorkflowCommitReceipt, assertWorkflowCreateReceipt, assertWorkflowRenewLeaseReceipt, assertWorkflowSnapshot, assertWorkflowSnapshotMatchesDefinition, materializeCanonicalJson, normalizePersistedWorkflowSnapshot, normalizeWorkflowSnapshot, WorkflowIdentityConflictError } from './validation'
import { resolveWorkflowDefinitionExact } from './definition'

export interface WorkflowManagerOptions { clock?: Clock, retrySchedule?: RetrySchedule, leaseDurationMs?: number, heartbeatIntervalMs?: number, idFactory?: () => string, tokenFactory?: () => string }
export interface WorkflowProcessOptions { signal?: AbortSignal }

const systemClock: Clock = { now: () => Date.now() }
const defaultRetry: RetrySchedule = attempt => Math.min(60_000, 1000 * 2 ** (attempt - 1))
class LeaseLostControl extends Error {}
class ExecutionAbortedControl extends Error {}
export type WorkflowProcessResult
  = | { outcome: 'processed', snapshot: WorkflowSnapshot }
    | { outcome: 'waiting', snapshot: WorkflowSnapshot, retryAt: number }
    | { outcome: 'terminal', snapshot: WorkflowSnapshot }
    | { outcome: 'contended', snapshot: WorkflowSnapshot }

export class WorkflowManager {
  private readonly clock: Clock
  private readonly retrySchedule: RetrySchedule
  private readonly leaseDurationMs: number
  private readonly heartbeatIntervalMs: number
  private readonly idFactory: () => string
  private readonly tokenFactory: () => string

  constructor(private readonly store: WorkflowStore, private readonly resolver: WorkflowDefinitionResolver, options: WorkflowManagerOptions = {}) {
    this.clock = options.clock ?? systemClock
    this.retrySchedule = options.retrySchedule ?? defaultRetry
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000
    if (!Number.isSafeInteger(this.leaseDurationMs) || this.leaseDurationMs < 2) throw new TypeError('leaseDurationMs must be an integer of at least 2')
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(1, Math.floor(this.leaseDurationMs / 3))
    if (!Number.isSafeInteger(this.heartbeatIntervalMs) || this.heartbeatIntervalMs < 1 || this.heartbeatIntervalMs >= this.leaseDurationMs) throw new TypeError('heartbeatIntervalMs must be a positive integer less than leaseDurationMs')
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID())
    this.tokenFactory = options.tokenFactory ?? (() => crypto.randomUUID())
  }

  /** Rebinds persistence while retaining this manager's registry and execution policy. */
  using(store: WorkflowStore): WorkflowManager {
    return new WorkflowManager(store, this.resolver, {
      clock: this.clock,
      retrySchedule: this.retrySchedule,
      leaseDurationMs: this.leaseDurationMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      idFactory: this.idFactory,
      tokenFactory: this.tokenFactory,
    })
  }

  async start<I extends JsonValue>(reference: WorkflowDefinitionReference | WorkflowDefinition<I>, input: I, startKey: string): Promise<WorkflowSnapshot> {
    if (!startKey) throw new TypeError('A non-empty start key is required')
    const canonicalInput = materializeCanonicalJson(input, 'Workflow input') as I
    const definition = resolveWorkflowDefinitionExact(this.resolver, reference) as WorkflowDefinition<I>
    if ('steps' in reference && !sameDefinition(reference, definition)) throw new TypeError('Workflow definition must match the exact registered definition; pass a { name, version } reference instead')
    const now = this.clock.now()
    const id = this.idFactory()
    const snapshot: WorkflowSnapshot = {
      snapshotFormatVersion: 1, id, workflowName: definition.name, workflowVersion: definition.version, startKey,
      canonicalInput: canonicalize(canonicalInput), input: canonicalInput, state: 'pending', revision: 0,
      cancellationRequested: false, createdAt: now, updatedAt: now,
      steps: definition.steps.map((step, index) => ({ name: step.name, state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: `${id}:step:${index}`, ...(step.compensate ? { compensationIdempotencyKey: `${id}:compensate:${index}` } : {}) })),
    }
    assertWorkflowSnapshotMatchesDefinition(snapshot, definition)
    const result = assertWorkflowCreateReceipt(snapshot, await this.store.create(snapshot))
    this.assertStartResult(snapshot, result.snapshot, definition, result.created)
    return result.snapshot
  }

  /** Diagnostic read: validates snapshot format but does not require a deployed definition. */
  async status(id: string): Promise<WorkflowSnapshot | null> {
    const snapshot = await this.store.get(id)
    return snapshot ? normalizePersistedWorkflowSnapshot(snapshot) : null
  }

  resolveSnapshot(snapshot: WorkflowSnapshot): WorkflowDefinition {
    const normalized = normalizeWorkflowSnapshot(snapshot)
    const definition = resolveWorkflowDefinitionExact(this.resolver, { name: normalized.workflowName, version: normalized.workflowVersion })
    assertWorkflowSnapshotMatchesDefinition(normalized, definition)
    return definition
  }

  assertProcessable(snapshot: WorkflowSnapshot): WorkflowDefinition { return this.resolveSnapshot(snapshot) }

  async cancel(id: string): Promise<WorkflowSnapshot> {
    const snapshot = normalizePersistedWorkflowSnapshot(await this.required(id))
    this.assertProcessable(snapshot)
    if (isWorkflowTerminal(snapshot) || snapshot.cancellationRequested) return snapshot
    const now = this.clock.now()
    return assertWorkflowCancellationReceipt(snapshot, await this.store.requestCancellation(id, snapshot.revision, now), now)
  }

  /** Processes at most one handler attempt (plus its persisted boundaries). */
  async process(id: string, options: WorkflowProcessOptions = {}): Promise<WorkflowSnapshot> {
    return (await this.processResult(id, options)).snapshot
  }

  /** Processes at most one authoritative transition and reports why processing stopped. */
  async processResult(id: string, options: WorkflowProcessOptions = {}): Promise<WorkflowProcessResult> {
    if (options.signal?.aborted) throw new WorkflowExecutionAbortedError()
    const observed = normalizePersistedWorkflowSnapshot(await this.required(id))
    const definition = this.assertProcessable(observed)
    if (isWorkflowTerminal(observed)) return { outcome: 'terminal', snapshot: observed }
    const now = this.clock.now()
    const retryAt = workflowNextRetryAt(observed)
    if (isWorkflowWaiting(observed) && retryAt !== null && retryAt > now) return { outcome: 'waiting', snapshot: observed, retryAt }
    const token = this.tokenFactory()
    let claimed: WorkflowSnapshot
    try { claimed = await this.store.claim(id, observed.revision, token, now, now + this.leaseDurationMs) }
    catch (error) {
      if (error instanceof RevisionConflictError || error instanceof LeaseConflictError) {
        const authoritative = normalizePersistedWorkflowSnapshot(await this.required(id))
        this.assertProcessable(authoritative)
        return this.classifyClaimConflict(authoritative)
      }
      throw error
    }
    claimed = assertWorkflowClaimReceipt(observed, claimed, token, now, now + this.leaseDurationMs)
    assertWorkflowSnapshotMatchesDefinition(claimed, definition)
    return { outcome: 'processed', snapshot: await this.advance(claimed, definition, token, options) }
  }

  async run(id: string, maxTransitions = 100, options: WorkflowProcessOptions = {}): Promise<WorkflowSnapshot> {
    let snapshot = normalizePersistedWorkflowSnapshot(await this.required(id))
    this.assertProcessable(snapshot)
    for (let count = 0; count < maxTransitions && !isWorkflowTerminal(snapshot); count++) {
      const before = snapshot.revision
      snapshot = await this.process(id, options)
      if (snapshot.revision === before) break
    }
    return snapshot
  }

  private async advance(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, options: WorkflowProcessOptions) {
    if (options.signal?.aborted) throw new WorkflowExecutionAbortedError()
    if (snapshot.cancellationRequested && !isCompensating(snapshot)) {
      const steps = snapshot.steps.map((step) => {
        if (step.state !== 'waiting_retry') return step
        const { retryAt: _retryAt, error: _error, ...cancelledStep } = step
        return { ...cancelledStep, state: 'pending' as const }
      })
      return this.commit(snapshot, definition, token, this.beginCompensationOrCancel({ ...snapshot, steps }, definition))
    }
    return isCompensating(snapshot) ? this.compensate(snapshot, definition, token, options) : this.execute(snapshot, definition, token, options)
  }

  private async execute(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, options: WorkflowProcessOptions) {
    const index = snapshot.steps.findIndex(step => step.state !== 'committed')
    if (index < 0) return this.commit(snapshot, definition, token, { ...snapshot, state: 'completed' })
    if (snapshot.steps[index]!.state === 'running') return this.interruptedForward(snapshot, definition, token, index)
    const step = definition.steps[index]!
    const steps = snapshot.steps.map(value => ({ ...value }))
    const current = steps[index]!
    current.state = 'running'; current.attempts++; delete current.retryAt; delete current.error
    const started = await this.commit(snapshot, definition, token, { ...snapshot, steps, state: 'running' }, false)
    try {
      const execution = await this.withHeartbeat(started, token, options.signal, true, signal => step.run({ workflowId: started.id, input: materializeCanonicalJson(started.input) as never, previousOutput: index && started.steps[index - 1]?.output !== undefined ? materializeCanonicalJson(started.steps[index - 1]!.output) : undefined, idempotencyKey: current.idempotencyKey, attempt: current.attempts, signal }))
      if (execution.cancelled) {
        current.state = 'pending'
        return this.commit(started, definition, token, this.beginCompensationOrCancel({ ...started, steps, state: 'running', cancellationRequested: true }, definition))
      }
      const output = materializeCanonicalJson(execution.value, 'Workflow step output')
      current.output = output; current.state = 'committed'
      // Completion is a separate transition so a cancellation racing this effect is observed and compensated.
      return this.commit(started, definition, token, { ...started, steps, state: 'running', cancellationRequested: execution.cancellationObserved || started.cancellationRequested })
    }
    catch (error) {
      if (error instanceof LeaseLostControl) throw new WorkflowLeaseLostError()
      if (error instanceof ExecutionAbortedControl) throw new WorkflowExecutionAbortedError()
      return this.finishForwardFailure(started, definition, token, index, steps, error)
    }
  }

  private finishForwardFailure(started: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number, steps: WorkflowSnapshot['steps'], error: unknown) {
    const current = steps[index]!
    const step = definition.steps[index]!
    current.error = normalizeError(error)
    const delay = current.attempts < step.maxAttempts ? this.retrySchedule(current.attempts, error, 'step') : null
    if (delay !== null) { current.state = 'waiting_retry'; current.retryAt = this.clock.now() + Math.max(0, delay); return this.commit(started, definition, token, { ...started, steps, state: 'waiting_retry' }) }
    current.state = 'failed'
    return this.commit(started, definition, token, this.beginCompensationOrCancel({ ...started, steps, state: 'failed' }, definition, false))
  }

  private interruptedForward(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number) {
    const error = new Error('Previous step attempt was interrupted before its result was committed')
    return this.finishForwardFailure(snapshot, definition, token, index, snapshot.steps.map(value => ({ ...value })), error)
  }

  private async compensate(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, options: WorkflowProcessOptions) {
    let index = -1
    for (let cursor = snapshot.steps.length - 1; cursor >= 0; cursor--) {
      const state = snapshot.steps[cursor]!.state
      if ((state === 'committed' || state === 'compensation_waiting_retry' || state === 'compensating') && definition.steps[cursor]?.compensate) { index = cursor; break }
    }
    if (index < 0) return this.commit(snapshot, definition, token, { ...snapshot, state: snapshot.cancellationRequested ? 'cancelled' : 'compensated' })
    if (snapshot.steps[index]!.state === 'compensating') return this.interruptedCompensation(snapshot, definition, token, index)
    const steps = snapshot.steps.map(value => ({ ...value }))
    const current = steps[index]!
    const step = definition.steps[index]!
    current.state = 'compensating'; current.compensationAttempts++; delete current.retryAt; delete current.error
    const started = await this.commit(snapshot, definition, token, { ...snapshot, steps, state: 'compensating' }, false)
    try {
      await this.withHeartbeat(started, token, options.signal, false, signal => step.compensate!({ workflowId: started.id, input: materializeCanonicalJson(started.input) as never, previousOutput: index && started.steps[index - 1]?.output !== undefined ? materializeCanonicalJson(started.steps[index - 1]!.output) : undefined, stepOutput: materializeCanonicalJson(current.output!), idempotencyKey: current.compensationIdempotencyKey!, attempt: current.compensationAttempts, signal }))
      current.state = 'compensated'
      return this.commit(started, definition, token, { ...started, steps, state: 'compensating' })
    }
    catch (error) {
      if (error instanceof LeaseLostControl) throw new WorkflowLeaseLostError()
      if (error instanceof ExecutionAbortedControl) throw new WorkflowExecutionAbortedError()
      return this.finishCompensationFailure(started, definition, token, index, steps, error)
    }
  }

  private finishCompensationFailure(started: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number, steps: WorkflowSnapshot['steps'], error: unknown) {
    const current = steps[index]!
    const step = definition.steps[index]!
    current.error = normalizeError(error)
    const delay = current.compensationAttempts < step.maxAttempts ? this.retrySchedule(current.compensationAttempts, error, 'compensation') : null
    if (delay !== null) { current.state = 'compensation_waiting_retry'; current.retryAt = this.clock.now() + Math.max(0, delay); return this.commit(started, definition, token, { ...started, steps, state: 'compensation_waiting_retry' }) }
    current.state = 'compensation_failed'
    return this.commit(started, definition, token, { ...started, steps, state: 'compensation_failed' })
  }

  private interruptedCompensation(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, token: string, index: number) {
    const error = new Error('Previous compensation attempt was interrupted before its result was committed')
    return this.finishCompensationFailure(snapshot, definition, token, index, snapshot.steps.map(value => ({ ...value })), error)
  }

  private beginCompensationOrCancel(snapshot: WorkflowSnapshot, definition: WorkflowDefinition, cancellation = true): WorkflowSnapshot {
    const hasCompensation = snapshot.steps.some((step, index) => step.state === 'committed' && definition.steps[index]?.compensate)
    return { ...snapshot, state: hasCompensation ? 'compensating' : cancellation ? 'cancelled' : 'failed' }
  }

  private async commit(original: WorkflowSnapshot, definition: WorkflowDefinition, token: string, next: WorkflowSnapshot, releaseLease = true): Promise<WorkflowSnapshot> {
    const now = this.clock.now()
    const candidate = { ...next, updatedAt: Math.max(next.updatedAt, now) }
    assertWorkflowSnapshot(candidate)
    assertWorkflowSnapshotMatchesDefinition(candidate, definition)
    let receipt: WorkflowSnapshot
    try { receipt = await this.store.commit(candidate, original.revision, token, now, releaseLease) }
    catch (error) {
      if (!(error instanceof RevisionConflictError) || (candidate.state !== 'completed' && candidate.state !== 'failed')) throw error
      const authoritative = normalizePersistedWorkflowSnapshot(await this.required(candidate.id))
      assertWorkflowSnapshotMatchesDefinition(authoritative, definition)
      if (!authoritative.cancellationRequested || authoritative.lease?.token !== token) throw error
      const cancellationCandidate = candidate.state === 'failed'
        ? { ...candidate, revision: authoritative.revision, cancellationRequested: true, updatedAt: Math.max(candidate.updatedAt, authoritative.updatedAt), lease: authoritative.lease }
        : authoritative
      return this.commit(authoritative, definition, token, this.beginCompensationOrCancel(cancellationCandidate, definition))
    }
    const committed = assertWorkflowCommitReceipt(original, candidate, receipt, token, now, releaseLease)
    assertWorkflowSnapshotMatchesDefinition(committed, definition)
    return committed
  }

  private async withHeartbeat<T>(started: WorkflowSnapshot, token: string, parentSignal: AbortSignal | undefined, abortOnCancellation: boolean, handler: (signal: AbortSignal) => T | Promise<T>): Promise<{ cancelled: true } | { cancelled: false, value: T, cancellationObserved: boolean }> {
    if (parentSignal?.aborted) throw new ExecutionAbortedControl()
    const controller = new AbortController()
    const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal
    let renewal = Promise.resolve()
    let leaseLost = false
    let cancellationObserved = false
    let renewing = false
    let observedLease = started
    const renew = () => {
      if (renewing || leaseLost) return
      renewing = true
      renewal = (async () => {
        try {
          const now = this.clock.now()
          const expiresAt = now + this.leaseDurationMs
          const authoritative = assertWorkflowRenewLeaseReceipt(observedLease, await this.store.renewLease(started.id, started.revision, token, now, expiresAt), started.revision, token, now, expiresAt)
          observedLease = authoritative
          if (this.clock.now() >= authoritative.lease!.expiresAt) throw new LeaseConflictError()
          if (abortOnCancellation && authoritative.cancellationRequested) {
            cancellationObserved = true
            controller.abort(new Error('Workflow cancellation requested'))
          }
        }
        catch {
          leaseLost = true
          controller.abort(new WorkflowLeaseLostError())
        }
        finally {
          renewing = false
        }
      })()
    }
    const heartbeat = setInterval(renew, this.heartbeatIntervalMs)
    let value: T | undefined
    let failure: unknown
    let failed = false
    try { value = await handler(signal) }
    catch (error) { failed = true; failure = error }
    finally {
      clearInterval(heartbeat)
      await renewal
    }
    if (leaseLost) throw new LeaseLostControl()
    if (parentSignal?.aborted) throw new ExecutionAbortedControl()
    if (cancellationObserved && failed) return { cancelled: true }
    if (failed) throw failure
    return { cancelled: false, value: value as T, cancellationObserved }
  }

  private async required(id: string) { const snapshot = await this.store.get(id); if (!snapshot) throw new Error(`Workflow not found: ${id}`); return snapshot }

  private classifyClaimConflict(snapshot: WorkflowSnapshot): WorkflowProcessResult {
    if (isWorkflowTerminal(snapshot)) return { outcome: 'terminal', snapshot }
    const retryAt = workflowNextRetryAt(snapshot)
    if (isWorkflowWaiting(snapshot) && retryAt !== null) return { outcome: 'waiting', snapshot, retryAt }
    return { outcome: 'contended', snapshot }
  }

  private assertStartResult<I extends JsonValue>(requested: WorkflowSnapshot, persisted: WorkflowSnapshot, definition: WorkflowDefinition<I>, created: boolean): void {
    assertWorkflowSnapshotMatchesDefinition(persisted, definition)
    if (created) {
      return
    }
    const persistedInput = materializeCanonicalJson(persisted.input, 'Workflow input')
    if (persisted.workflowName !== requested.workflowName
      || persisted.workflowVersion !== requested.workflowVersion
      || persisted.startKey !== requested.startKey
      || persisted.canonicalInput !== requested.canonicalInput
      || canonicalize(persistedInput) !== requested.canonicalInput)
      throw new WorkflowIdentityConflictError()
  }
}

function isCompensating(snapshot: WorkflowSnapshot) { return snapshot.state === 'compensating' || snapshot.state === 'compensation_waiting_retry' }
function sameDefinition<I extends JsonValue>(reference: WorkflowDefinition<I>, registered: WorkflowDefinition<I>): boolean {
  return reference.name === registered.name && reference.version === registered.version && reference.steps.length === registered.steps.length
    && reference.steps.every((step, index) => {
      const expected = registered.steps[index]
      return step.name === expected?.name && step.run === expected.run && step.compensate === expected.compensate && step.maxAttempts === expected.maxAttempts
    })
}
function normalizeError(error: unknown): WorkflowError {
  const safeText = (read: () => unknown, fallback: string, max: number, allowEmpty = false) => {
    let value: string
    try { value = String(read()) }
    catch { value = fallback }
    if (!allowEmpty && value.length === 0) value = fallback
    return value.slice(0, max)
  }
  const candidate = error && (typeof error === 'object' || typeof error === 'function') ? error as { name?: unknown, message?: unknown } : null
  return {
    name: safeText(() => candidate?.name ?? 'Error', 'Error', 128),
    message: safeText(() => candidate ? candidate.message ?? error : error, 'Unknown workflow handler error', 4096),
  }
}

export function canonicalize(value: JsonValue): string {
  return canonicalizeMaterialized(materializeCanonicalJson(value))
}

function canonicalizeMaterialized(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalizeMaterialized).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalizeMaterialized(value[key]!)}`).join(',')}}`
}
