/* eslint-disable unicorn/error-message, @stylistic/max-statements-per-line, @stylistic/no-mixed-operators -- Internal validation sentinels are converted to one bounded public error. */
import type { JsonValue, StepSnapshot, WorkflowDefinition, WorkflowSnapshot, WorkflowState } from './types'

const stableIdentity = /^[a-z\d](?:[\w.-]{0,62}[a-z\d])?$/i
const reservedVersions = new Set(['latest', 'default', 'current'])
const workflowStates = new Set<WorkflowState>(['pending', 'running', 'waiting_retry', 'completed', 'failed', 'compensating', 'compensation_waiting_retry', 'compensated', 'compensation_failed', 'cancelled'])
const stepStates = new Set<StepSnapshot['state']>(['pending', 'running', 'waiting_retry', 'committed', 'compensating', 'compensation_waiting_retry', 'compensated', 'failed', 'compensation_failed'])
const outputStates = new Set<StepSnapshot['state']>(['committed', 'compensating', 'compensation_waiting_retry', 'compensated', 'compensation_failed'])
const attemptStates = new Set<StepSnapshot['state']>(['running', 'waiting_retry', 'failed'])
const compensationAttemptStates = new Set<StepSnapshot['state']>(['compensating', 'compensation_waiting_retry', 'compensated', 'compensation_failed'])
const waitingStates = new Set<StepSnapshot['state']>(['waiting_retry', 'compensation_waiting_retry'])
const errorStates = new Set<StepSnapshot['state']>(['waiting_retry', 'failed', 'compensation_waiting_retry', 'compensation_failed'])
const maxTimestamp = 8_640_000_000_000_000
const maxOpaqueText = 1024
const maxErrorName = 128
const maxErrorMessage = 4096
const snapshotKeys = new Set(['snapshotFormatVersion', 'id', 'workflowName', 'workflowVersion', 'startKey', 'canonicalInput', 'input', 'state', 'revision', 'steps', 'lease', 'cancellationRequested', 'createdAt', 'updatedAt'])
const stepKeys = new Set(['name', 'state', 'attempts', 'compensationAttempts', 'idempotencyKey', 'compensationIdempotencyKey', 'output', 'retryAt', 'error'])

const describe = (value: unknown): string => {
  try { return JSON.stringify(value) ?? String(value) }
  catch { return String(value) }
}

export class InvalidWorkflowVersionError extends TypeError {
  readonly version: unknown
  constructor(version: unknown, persisted = false) {
    super(persisted
      ? `Persisted workflow version ${describe(version)} is invalid; repair the row to the exact registered version before processing`
      : 'Workflow version must be 1..64 ASCII characters, start and end alphanumeric, and contain only letters, numbers, dot, underscore, or hyphen; latest, default, and current are reserved')
    this.name = 'InvalidWorkflowVersionError'
    this.version = version
  }
}

export class UnsupportedWorkflowSnapshotFormatError extends Error {
  readonly snapshotFormatVersion: unknown
  readonly workflowId?: string
  constructor(snapshotFormatVersion: unknown, workflowId?: string) {
    super(`Unsupported workflow snapshot format ${describe(snapshotFormatVersion)}${workflowId ? ` for ${workflowId}` : ''}`)
    this.name = 'UnsupportedWorkflowSnapshotFormatError'
    this.snapshotFormatVersion = snapshotFormatVersion
    this.workflowId = workflowId
  }
}

export class InvalidWorkflowSnapshotError extends TypeError {
  constructor() {
    super('Workflow snapshot is malformed or violates persisted state invariants')
    this.name = 'InvalidWorkflowSnapshotError'
  }
}

export class WorkflowIdentityConflictError extends Error {
  constructor() {
    super('Workflow definition identity cannot be changed by a snapshot commit')
    this.name = 'WorkflowIdentityConflictError'
  }
}

export type WorkflowStoreOperation = 'create' | 'claim' | 'renew' | 'commit' | 'cancellation'
export class WorkflowStoreContractError extends WorkflowIdentityConflictError {
  readonly operation: WorkflowStoreOperation
  constructor(operation: WorkflowStoreOperation) {
    super()
    this.name = 'WorkflowStoreContractError'
    this.operation = operation
    this.message = `Workflow store returned an invalid ${operation} receipt`
  }
}

export function assertWorkflowVersion(version: unknown, persisted = false): asserts version is string {
  if (typeof version !== 'string' || !stableIdentity.test(version) || reservedVersions.has(version.toLowerCase())) throw new InvalidWorkflowVersionError(version, persisted)
}

export function assertWorkflowName(name: unknown, subject = 'Workflow name'): asserts name is string {
  if (typeof name !== 'string' || !stableIdentity.test(name)) throw new TypeError(`${subject} must be 1..64 ASCII characters, start and end alphanumeric, and contain only letters, numbers, dot, underscore, or hyphen`)
}

export function assertWorkflowStoreExpectedRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError('expectedRevision must be a nonnegative safe integer')
}

export function assertWorkflowStoreLeaseToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxOpaqueText) throw new TypeError(`leaseToken must be a non-empty string of at most ${maxOpaqueText} characters`)
}

export function assertWorkflowStoreTimestamp(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maxTimestamp) throw new TypeError(`${name} must be a nonnegative safe workflow timestamp`)
}

export function assertWorkflowStoreLeaseArguments(expectedRevision: unknown, leaseToken: unknown, now: unknown, expiresAt: unknown): void {
  assertWorkflowStoreExpectedRevision(expectedRevision)
  assertWorkflowStoreLeaseToken(leaseToken)
  assertWorkflowStoreTimestamp(now, 'now')
  assertWorkflowStoreTimestamp(expiresAt, 'expiresAt')
  if ((expiresAt as number) <= (now as number)) throw new TypeError('expiresAt must be greater than now')
}

/** Strictly validates the complete persisted snapshot and its workflow/step state machine boundary. */
export function assertWorkflowSnapshot(value: unknown): asserts value is WorkflowSnapshot {
  try { assertSnapshot(value) }
  catch (error) {
    if (error instanceof UnsupportedWorkflowSnapshotFormatError || error instanceof InvalidWorkflowVersionError) throw error
    throw new InvalidWorkflowSnapshotError()
  }
}

/** Strict source/candidate validation with legacy missing-format compatibility only. */
export function normalizeWorkflowSnapshot(value: WorkflowSnapshot | (Omit<WorkflowSnapshot, 'snapshotFormatVersion'> & { snapshotFormatVersion?: unknown })): WorkflowSnapshot {
  if (!isPlainRecord(value)) throw new InvalidWorkflowSnapshotError()
  const format = value.snapshotFormatVersion === undefined ? 1 : value.snapshotFormatVersion
  if (!Number.isInteger(format) || format !== 1) throw new UnsupportedWorkflowSnapshotFormatError(format, typeof value.id === 'string' ? value.id : undefined)
  const snapshot = (value.snapshotFormatVersion === 1 ? value : { ...value, snapshotFormatVersion: 1 }) as WorkflowSnapshot
  assertWorkflowSnapshot(snapshot)
  return snapshot
}

/**
 * Normalizes only previous-release serialized error text at authoritative persisted-read boundaries.
 * All other data is preserved and the resulting snapshot is then strictly validated.
 */
export function normalizePersistedWorkflowSnapshot(value: unknown): WorkflowSnapshot {
  if (!isPlainRecord(value)) throw new InvalidWorkflowSnapshotError()
  const format = value.snapshotFormatVersion === undefined ? 1 : value.snapshotFormatVersion
  if (!Number.isInteger(format) || format !== 1) throw new UnsupportedWorkflowSnapshotFormatError(format, typeof value.id === 'string' ? value.id : undefined)
  const steps = normalizePersistedSteps(value.steps)
  const snapshot = { ...value, snapshotFormatVersion: 1, steps } as WorkflowSnapshot
  assertWorkflowSnapshot(snapshot)
  return snapshot
}

function normalizePersistedSteps(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  const steps = copyDataArray(value)
  return steps.map((candidate) => {
    if (!isPlainRecord(candidate) || !Object.hasOwn(candidate, 'error')) return candidate
    const error = candidate.error
    if (!isPlainRecord(error)) return candidate
    const name = typeof error.name === 'string' ? (error.name || 'Error').slice(0, maxErrorName) : error.name
    const message = typeof error.message === 'string' ? error.message.slice(0, maxErrorMessage) : error.message
    return { ...candidate, error: { ...error, name, message } }
  })
}

/** Copies an ordinary serialized array only through own data descriptors, never accessors. */
function copyDataArray(value: unknown[]): unknown[] {
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => key !== 'length' && (typeof key !== 'string' || !isArrayIndex(key, value.length)))) throw new InvalidWorkflowSnapshotError()
  const result: unknown[] = []
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new InvalidWorkflowSnapshotError()
    result.push(descriptor.value)
  }
  return result
}

const sameStepIdentity = (left: StepSnapshot, right: StepSnapshot): boolean => left.name === right.name
  && left.idempotencyKey === right.idempotencyKey
  && left.compensationIdempotencyKey === right.compensationIdempotencyKey

export function assertWorkflowIdentityUnchanged(current: WorkflowSnapshot, candidate: WorkflowSnapshot): void {
  const unchanged = current.id === candidate.id
    && current.workflowName === candidate.workflowName
    && current.workflowVersion === candidate.workflowVersion
    && current.startKey === candidate.startKey
    && current.createdAt === candidate.createdAt
    && current.canonicalInput === candidate.canonicalInput
    && sameStructuredValue(current.input, candidate.input)
    && current.snapshotFormatVersion === candidate.snapshotFormatVersion
    && current.steps.length === candidate.steps.length
    && current.steps.every((step, index) => sameStepIdentity(step, candidate.steps[index]!))
  if (!unchanged) throw new WorkflowIdentityConflictError()
}

/** Validates create exactness or an authoritative idempotent replay. */
export function assertWorkflowCreateReceipt(requested: WorkflowSnapshot, result: { snapshot: WorkflowSnapshot, created: boolean }): { snapshot: WorkflowSnapshot, created: boolean } {
  if (!result || typeof result !== 'object' || typeof result.created !== 'boolean') throw new WorkflowStoreContractError('create')
  const persisted = contractSnapshot(result.snapshot, 'create')
  if (result.created) {
    if (!sameStructuredValue(persisted, requested)) throw new WorkflowStoreContractError('create')
  }
  else if (persisted.workflowName !== requested.workflowName
    || persisted.workflowVersion !== requested.workflowVersion
    || persisted.startKey !== requested.startKey
    || persisted.canonicalInput !== requested.canonicalInput
    || canonicalJson(persisted.input) !== requested.canonicalInput)
    throw new WorkflowStoreContractError('create')
  return { snapshot: persisted, created: result.created }
}

/** Validates that claim changed only the exact revision, timestamp, and requested lease. */
export function assertWorkflowClaimReceipt(observed: WorkflowSnapshot, receipt: WorkflowSnapshot, token: string, now: number, expiresAt: number, expectedRevision = observed.revision): WorkflowSnapshot {
  const claimed = contractSnapshot(receipt, 'claim')
  const expected: WorkflowSnapshot = { ...observed, revision: observed.revision + 1, updatedAt: Math.max(observed.updatedAt, now), lease: { token, expiresAt } }
  if (observed.revision !== expectedRevision || expiresAt <= now || !sameStructuredValue(claimed, expected)) throw new WorkflowStoreContractError('claim')
  return claimed
}

/** Validates a lease renewal, including the sole concurrent-cancellation revision race. */
export function assertWorkflowRenewLeaseReceipt(observed: WorkflowSnapshot, receipt: WorkflowSnapshot, expectedRevision: number, token: string, now: number, expiresAt: number): WorkflowSnapshot {
  const renewed = contractSnapshot(receipt, 'renew')
  const currentRevisionValid = observed.revision === expectedRevision || (observed.revision === expectedRevision + 1 && observed.cancellationRequested)
  const cancellationRace = !observed.cancellationRequested && renewed.cancellationRequested
  const revisionValid = renewed.revision === observed.revision + (cancellationRace ? 1 : 0)
  const cancellationValid = renewed.cancellationRequested === observed.cancellationRequested || cancellationRace
  const updatedAtValid = cancellationRace
    ? renewed.updatedAt >= observed.updatedAt
    : renewed.updatedAt === observed.updatedAt
  const authoritativeExpiresAt = Math.max(observed.lease?.expiresAt ?? expiresAt, expiresAt)
  const expected = { ...observed, revision: renewed.revision, cancellationRequested: renewed.cancellationRequested, updatedAt: renewed.updatedAt, lease: { token, expiresAt: authoritativeExpiresAt } }
  if (!currentRevisionValid || expiresAt <= now || !updatedAtValid || !revisionValid || !cancellationValid
    || !sameStructuredValue(renewed, expected)) throw new WorkflowStoreContractError('renew')
  return renewed
}

/** Validates the exact cancellation mutation and preservation of any lease. */
export function assertWorkflowCancellationReceipt(observed: WorkflowSnapshot, receipt: WorkflowSnapshot, now: number, expectedRevision = observed.revision): WorkflowSnapshot {
  const cancelled = contractSnapshot(receipt, 'cancellation')
  const expected: WorkflowSnapshot = { ...observed, revision: observed.revision + 1, cancellationRequested: true, updatedAt: Math.max(observed.updatedAt, now) }
  if (observed.revision !== expectedRevision || !sameStructuredValue(cancelled, expected)) throw new WorkflowStoreContractError('cancellation')
  return cancelled
}

/** Validates the authoritative receipt for one exact commit candidate. */
export function assertWorkflowCommitReceipt(original: WorkflowSnapshot, candidate: WorkflowSnapshot, receipt: WorkflowSnapshot, token: string, now: number, releaseLease: boolean, expectedRevision = candidate.revision): WorkflowSnapshot {
  const committed = contractSnapshot(receipt, 'commit')
  try {
    assertWorkflowSnapshot(candidate)
    assertWorkflowIdentityUnchanged(original, candidate)
    assertWorkflowIdentityUnchanged(original, committed)
  }
  catch { throw new WorkflowStoreContractError('commit') }

  const concurrentCancellation = original.revision === expectedRevision + 1 && original.cancellationRequested
  const originalRevisionValid = original.revision === expectedRevision || concurrentCancellation
  const cancellationMerge = candidate.cancellationRequested === false && committed.cancellationRequested === true
  const cancellationAcknowledged = original.cancellationRequested === false && candidate.cancellationRequested === true && committed.cancellationRequested === true
  const cancellationValid = committed.cancellationRequested === candidate.cancellationRequested || cancellationMerge
  const revisionValid = candidate.revision === expectedRevision && committed.revision === expectedRevision + (cancellationMerge || cancellationAcknowledged || concurrentCancellation ? 2 : 1)
  const leaseValid = releaseLease
    ? committed.lease === undefined
    : original.lease !== undefined && committed.lease !== undefined
      && committed.lease.token === token && committed.lease.token === original.lease.token
      && committed.lease.expiresAt >= original.lease.expiresAt && committed.lease.expiresAt > now
  const minimumMergedUpdatedAt = Math.max(original.updatedAt, candidate.updatedAt)
  const cancellationTimestampMerge = cancellationMerge || cancellationAcknowledged || concurrentCancellation
  const updatedAtValid = cancellationTimestampMerge
    ? committed.updatedAt >= minimumMergedUpdatedAt && (!original.cancellationRequested || committed.updatedAt === minimumMergedUpdatedAt)
    : committed.updatedAt === candidate.updatedAt
  const expectedUpdatedAt = cancellationTimestampMerge ? committed.updatedAt : candidate.updatedAt
  const expectedCandidate = { ...candidate, updatedAt: expectedUpdatedAt }
  if ((candidate.state === 'failed' && cancellationMerge)
    || !sameStructuredValue(withoutStoreManagedFields(committed), withoutStoreManagedFields(expectedCandidate))
    || !originalRevisionValid || !cancellationValid || !revisionValid || !leaseValid || !updatedAtValid)
    throw new WorkflowStoreContractError('commit')
  return committed
}

/** Validates persisted immutable step identities against one exact definition. */
export function assertWorkflowSnapshotMatchesDefinition<I extends JsonValue>(snapshot: WorkflowSnapshot, definition: WorkflowDefinition<I>): void {
  assertWorkflowSnapshot(snapshot)
  const matches = snapshot.workflowName === definition.name
    && snapshot.workflowVersion === definition.version
    && snapshot.steps.length === definition.steps.length
    && definition.steps.every((step, index) => {
      const persisted = snapshot.steps[index]
      return persisted?.name === step.name
        && persisted.idempotencyKey === `${snapshot.id}:step:${index}`
        && persisted.compensationIdempotencyKey === (step.compensate ? `${snapshot.id}:compensate:${index}` : undefined)
    })
  if (!matches) throw new WorkflowIdentityConflictError()
  definition.steps.forEach((definitionStep, index) => {
    const step = snapshot.steps[index]!
    if (step.attempts > definitionStep.maxAttempts || step.compensationAttempts > definitionStep.maxAttempts) throw new InvalidWorkflowSnapshotError()
    if (step.state === 'waiting_retry' && step.attempts >= definitionStep.maxAttempts) throw new InvalidWorkflowSnapshotError()
    if (step.state === 'compensation_waiting_retry' && step.compensationAttempts >= definitionStep.maxAttempts) throw new InvalidWorkflowSnapshotError()
    if (snapshot.state === 'failed' && step.state === 'committed' && definitionStep.compensate) throw new InvalidWorkflowSnapshotError()
  })
  if (snapshot.state === 'compensating') {
    const hasActiveCompensation = snapshot.steps.some(step => step.state === 'compensating' || step.state === 'compensation_waiting_retry')
    const hasCompensatableCommit = snapshot.steps.some((step, index) => step.state === 'committed' && Boolean(definition.steps[index]?.compensate))
    const isFinalTransitionBoundary = snapshot.steps.some(step => step.state === 'compensated')
    if (!hasActiveCompensation && !hasCompensatableCommit && !isFinalTransitionBoundary) throw new InvalidWorkflowSnapshotError()
  }
}

function assertSnapshot(value: unknown): asserts value is WorkflowSnapshot {
  if (!isPlainRecord(value) || value.snapshotFormatVersion !== 1 || !Array.isArray(value.steps)) throw new Error()
  if (Object.keys(value).some(key => !snapshotKeys.has(key))) throw new Error()
  assertBoundedText(value.id, maxOpaqueText)
  assertWorkflowName(value.workflowName)
  assertWorkflowVersion(value.workflowVersion, true)
  assertBoundedText(value.startKey, maxOpaqueText)
  if (typeof value.canonicalInput !== 'string' || value.canonicalInput.length > 1_000_000) throw new Error()
  assertJsonValue(value.input)
  if (canonicalJson(value.input) !== value.canonicalInput || !workflowStates.has(value.state as WorkflowState)) throw new Error()
  assertNonnegativeInteger(value.revision)
  if (typeof value.cancellationRequested !== 'boolean') throw new Error()
  assertTimestamp(value.createdAt); assertTimestamp(value.updatedAt)
  if ((value.updatedAt as number) < (value.createdAt as number)) throw new Error()
  if (value.lease !== undefined) {
    if (!isPlainRecord(value.lease) || Object.keys(value.lease).some(key => key !== 'token' && key !== 'expiresAt')) throw new Error()
    assertBoundedText(value.lease.token, maxOpaqueText); assertTimestamp(value.lease.expiresAt)
  }
  const names = new Set<string>()
  for (const candidate of value.steps) {
    assertStep(candidate)
    if (names.has(candidate.name)) throw new Error()
    names.add(candidate.name)
  }
  assertStateBoundary(value as unknown as WorkflowSnapshot)
}

function assertStep(value: unknown): asserts value is StepSnapshot {
  if (!isPlainRecord(value) || !stepStates.has(value.state as StepSnapshot['state'])) throw new Error()
  if (Object.keys(value).some(key => !stepKeys.has(key))) throw new Error()
  assertWorkflowName(value.name, 'Step name')
  assertNonnegativeInteger(value.attempts); assertNonnegativeInteger(value.compensationAttempts)
  assertBoundedText(value.idempotencyKey, maxOpaqueText)
  if (value.compensationIdempotencyKey !== undefined) assertBoundedText(value.compensationIdempotencyKey, maxOpaqueText)
  if (outputStates.has(value.state as StepSnapshot['state'])) {
    if ((value.attempts as number) < 1) throw new Error()
    if (!Object.hasOwn(value, 'output')) throw new Error()
    assertJsonValue(value.output)
  }
  else if (Object.hasOwn(value, 'output') && value.output !== undefined) throw new Error()
  if (attemptStates.has(value.state as StepSnapshot['state']) && (value.attempts as number) < 1) throw new Error()
  if (compensationAttemptStates.has(value.state as StepSnapshot['state'])) {
    if ((value.compensationAttempts as number) < 1 || value.compensationIdempotencyKey === undefined) throw new Error()
  }
  if (value.retryAt !== undefined) assertTimestamp(value.retryAt)
  if (waitingStates.has(value.state as StepSnapshot['state'])) {
    if (value.retryAt === undefined || value.error === undefined) throw new Error()
  }
  else if (value.retryAt !== undefined) throw new Error()
  if (errorStates.has(value.state as StepSnapshot['state'])) assertError(value.error)
  else if (value.error !== undefined) throw new Error()
}

function assertStateBoundary(snapshot: WorkflowSnapshot): void {
  const states = snapshot.steps.map(step => step.state)
  if (snapshot.state === 'pending') {
    if (snapshot.steps.some(step => step.state !== 'pending' || step.attempts !== 0 || step.compensationAttempts !== 0 || Object.hasOwn(step, 'output'))) throw new Error()
    return
  }
  if (snapshot.state === 'completed') {
    if (snapshot.cancellationRequested || states.some(state => state !== 'committed')) throw new Error()
    return
  }
  if (snapshot.state === 'failed' && snapshot.cancellationRequested) throw new Error()
  if (snapshot.state === 'cancelled' && !snapshot.cancellationRequested) throw new Error()
  if (snapshot.state === 'running') return assertForwardBoundary(states, 'running', true)
  if (snapshot.state === 'waiting_retry') return assertForwardBoundary(states, 'waiting_retry', false)
  if (snapshot.state === 'failed') return assertForwardBoundary(states, 'failed', false)
  assertCompensationBoundary(snapshot)
}

function assertForwardBoundary(states: StepSnapshot['state'][], marker: 'running' | 'waiting_retry' | 'failed', markerOptional: boolean): void {
  let index = 0
  while (states[index] === 'committed') index++
  if (states[index] === marker) index++
  else if (!markerOptional) throw new Error()
  while (states[index] === 'pending') index++
  if (index !== states.length) throw new Error()
}

function assertCompensationBoundary(snapshot: WorkflowSnapshot): void {
  const activeState = snapshot.state === 'compensation_waiting_retry' ? 'compensation_waiting_retry' : snapshot.state === 'compensating' ? 'compensating' : null
  const active = snapshot.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.state === 'compensating' || step.state === 'compensation_waiting_retry')
  if (active.length > 1 || (activeState && active.length === 1 && active[0]!.step.state !== activeState)
    || snapshot.state === 'compensation_waiting_retry' && active.length !== 1) throw new Error()
  if (!activeState && active.length) throw new Error()
  const failed = snapshot.steps.filter(step => step.state === 'failed')
  if (failed.length > 1) throw new Error()
  if ((snapshot.state === 'compensating' || snapshot.state === 'compensated') && snapshot.steps.every(step => step.state === 'pending')) throw new Error()
  if (snapshot.state === 'compensated' && !snapshot.steps.some(step => step.state === 'compensated')) throw new Error()
  let pendingSeen = false
  for (const step of snapshot.steps) {
    if (step.state === 'running' || step.state === 'waiting_retry') throw new Error()
    if (step.state === 'pending') pendingSeen = true
    else if (pendingSeen) throw new Error()
  }
  const activeIndex = active[0]?.index
  if (activeIndex !== undefined) {
    for (let index = 0; index < snapshot.steps.length; index++) {
      const step = snapshot.steps[index]!
      if (index > activeIndex && step.state === 'committed' && step.compensationIdempotencyKey) throw new Error()
      if (index < activeIndex && step.state === 'compensated') throw new Error()
    }
  }
  if (snapshot.state === 'compensated' || snapshot.state === 'cancelled') {
    if (snapshot.steps.some(step => step.state === 'compensation_failed' || (step.state === 'committed' && step.compensationIdempotencyKey))) throw new Error()
  }
  if (snapshot.state === 'compensation_failed') {
    const failures = snapshot.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.state === 'compensation_failed')
    if (failures.length !== 1) throw new Error()
    const failureIndex = failures[0]!.index
    if (snapshot.steps.some((step, index) => index > failureIndex && step.state === 'committed' && step.compensationIdempotencyKey)) throw new Error()
    if (snapshot.steps.some((step, index) => index < failureIndex && step.state === 'compensated')) throw new Error()
  }
}

function assertError(value: unknown): void {
  if (!isPlainRecord(value) || Object.keys(value).some(key => key !== 'name' && key !== 'message')) throw new Error()
  assertBoundedText(value.name, maxErrorName); assertBoundedText(value.message, maxErrorMessage, true)
}

function assertBoundedText(value: unknown, max: number, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > max) throw new Error()
}

function assertNonnegativeInteger(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error()
}

function assertTimestamp(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maxTimestamp) throw new Error()
}

function assertJsonValue(value: unknown, seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('must contain only finite JSON numbers'); return }
  if (!value || typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) throw new Error()
  seen.add(value)
  const keys = Reflect.ownKeys(value)
  if (Array.isArray(value)) {
    if (keys.some(key => key !== 'length' && (typeof key !== 'string' || !isArrayIndex(key, value.length)))) throw new Error()
    if (keys.filter(key => key !== 'length').length !== value.length) throw new Error()
  }
  else if (keys.some(key => typeof key !== 'string')) throw new Error()
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!descriptor.enumerable || !('value' in descriptor)) throw new Error()
    assertJsonValue(descriptor.value, seen)
  }
  seen.delete(value)
}

/** Validates and copies JSON without invoking user-controlled getters or retaining store-owned references. */
export function materializeCanonicalJson(value: unknown, subject = 'JSON value'): JsonValue {
  try {
    assertJsonValue(value)
    return cloneJson(value as JsonValue)
  }
  catch (error) {
    if (error instanceof TypeError && error.message === 'must contain only finite JSON numbers') throw new TypeError(`${subject} ${error.message}`)
    throw new TypeError(`${subject} must contain only enumerable plain JSON data properties`)
  }
}

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => cloneJson(item))
  const clone: { [key: string]: JsonValue } = {}
  for (const key of Object.keys(value)) {
    Object.defineProperty(clone, key, { value: cloneJson(value[key]!), enumerable: true, writable: true, configurable: true })
  }
  return clone
}

function isArrayIndex(key: string, length: number): boolean {
  if (!/^(?:0|[1-9]\d*)$/.test(key)) return false
  const index = Number(key)
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    return descriptor.enumerable && 'value' in descriptor
  })
}

function contractSnapshot(receipt: WorkflowSnapshot, operation: WorkflowStoreOperation): WorkflowSnapshot {
  try { return normalizeWorkflowSnapshot(receipt) }
  catch { throw new WorkflowStoreContractError(operation) }
}

function withoutStoreManagedFields(snapshot: WorkflowSnapshot): Omit<WorkflowSnapshot, 'revision' | 'cancellationRequested' | 'lease'> {
  const { revision: _revision, cancellationRequested: _cancellationRequested, lease: _lease, ...candidate } = snapshot
  return candidate
}

function sameStructuredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => sameStructuredValue(value, right[index]))
  if (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).filter(key => leftRecord[key] !== undefined).sort()
  const rightKeys = Object.keys(rightRecord).filter(key => rightRecord[key] !== undefined).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameStructuredValue(leftRecord[key], rightRecord[key]))
}
