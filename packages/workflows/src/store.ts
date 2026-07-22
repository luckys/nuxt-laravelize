/* eslint-disable @stylistic/max-statements-per-line */
import type { WorkflowSnapshot } from './types'

export class StartKeyConflictError extends Error { constructor() { super('Start key already exists with different workflow or input'); this.name = 'StartKeyConflictError' } }
export class RevisionConflictError extends Error { constructor() { super('Workflow revision is stale'); this.name = 'RevisionConflictError' } }
export class LeaseConflictError extends Error { constructor() { super('Workflow lease is stale or unavailable'); this.name = 'LeaseConflictError' } }
export class WorkflowLeaseLostError extends Error { constructor() { super('Workflow lease ownership was lost'); this.name = 'WorkflowLeaseLostError' } }
export class WorkflowExecutionAbortedError extends Error { constructor() { super('Workflow execution was aborted'); this.name = 'WorkflowExecutionAbortedError' } }

export interface WorkflowStore {
  create(snapshot: WorkflowSnapshot): Promise<{ snapshot: WorkflowSnapshot, created: boolean }>
  get(id: string): Promise<WorkflowSnapshot | null>
  claim(id: string, expectedRevision: number, token: string, now: number, expiresAt: number): Promise<WorkflowSnapshot>
  renewLease(id: string, expectedRevision: number, token: string, now: number, expiresAt: number): Promise<WorkflowSnapshot>
  /** Fences revision/lease, merges a concurrent cancellation, and optionally retains the lease. */
  commit(snapshot: WorkflowSnapshot, expectedRevision: number, leaseToken: string, now: number, releaseLease?: boolean): Promise<WorkflowSnapshot>
  requestCancellation(id: string, expectedRevision: number, now: number): Promise<WorkflowSnapshot>
}

export interface WorkflowRecoveryCursor { updatedAt: number, id: string }
export interface WorkflowRecoveryQuery { updatedBefore: number, cursor?: WorkflowRecoveryCursor, limit?: number }
export interface WorkflowRecoveryPage { workflowIds: string[], nextCursor?: WorkflowRecoveryCursor }

/** Optional store capability used by bounded recovery scans. */
export interface RecoverableWorkflowStore extends WorkflowStore {
  discoverRecoverable(query: WorkflowRecoveryQuery): Promise<WorkflowRecoveryPage>
}

export function isRecoverableWorkflowStore(store: WorkflowStore): store is RecoverableWorkflowStore {
  return 'discoverRecoverable' in store && typeof store.discoverRecoverable === 'function'
}

const recoveryLimit = (limit = 100): number => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('limit must be an integer between 1 and 1000')
  return limit
}

const validateRecoveryQuery = (query: WorkflowRecoveryQuery): number => {
  if (!Number.isSafeInteger(query.updatedBefore)) throw new TypeError('updatedBefore must be a safe integer')
  if (query.cursor && (!Number.isSafeInteger(query.cursor.updatedAt) || !query.cursor.id)) throw new TypeError('Invalid workflow recovery cursor')
  return recoveryLimit(query.limit)
}

const clone = <T>(value: T): T => structuredClone(value)

/** Volatile, process-local test/development store. All data is lost on restart. */
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly snapshots = new Map<string, WorkflowSnapshot>()
  private readonly startKeys = new Map<string, string>()

  async create(snapshot: WorkflowSnapshot) {
    const key = `${snapshot.workflowName}\u0000${snapshot.workflowVersion}\u0000${snapshot.startKey}`
    const existingId = this.startKeys.get(key)
    if (existingId) {
      const existing = this.snapshots.get(existingId)!
      if (existing.canonicalInput !== snapshot.canonicalInput) throw new StartKeyConflictError()
      return { snapshot: clone(existing), created: false }
    }
    if (this.snapshots.has(snapshot.id)) throw new StartKeyConflictError()
    this.startKeys.set(key, snapshot.id)
    this.snapshots.set(snapshot.id, clone(snapshot))
    return { snapshot: clone(snapshot), created: true }
  }

  async get(id: string) { const value = this.snapshots.get(id); return value ? clone(value) : null }

  async discoverRecoverable(query: WorkflowRecoveryQuery): Promise<WorkflowRecoveryPage> {
    const limit = validateRecoveryQuery(query)
    const snapshots = [...this.snapshots.values()]
      .filter(snapshot => !['completed', 'failed', 'compensated', 'compensation_failed', 'cancelled'].includes(snapshot.state))
      .filter(snapshot => snapshot.updatedAt <= query.updatedBefore)
      .filter(snapshot => !query.cursor || snapshot.updatedAt > query.cursor.updatedAt || (snapshot.updatedAt === query.cursor.updatedAt && snapshot.id > query.cursor.id))
      .sort((left, right) => left.updatedAt - right.updatedAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .slice(0, limit)
    const last = snapshots.at(-1)
    return {
      workflowIds: snapshots.map(snapshot => snapshot.id),
      ...(snapshots.length === limit && last ? { nextCursor: { updatedAt: last.updatedAt, id: last.id } } : {}),
    }
  }

  async claim(id: string, expectedRevision: number, token: string, now: number, expiresAt: number) {
    const current = this.required(id)
    if (current.revision !== expectedRevision) throw new RevisionConflictError()
    if (current.lease && current.lease.expiresAt > now) throw new LeaseConflictError()
    const next = { ...current, revision: current.revision + 1, lease: { token, expiresAt }, updatedAt: now }
    this.snapshots.set(id, clone(next)); return clone(next)
  }

  async renewLease(id: string, expectedRevision: number, token: string, now: number, expiresAt: number) {
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt) || expiresAt <= now) throw new TypeError('expiresAt must be greater than now')
    const current = this.required(id)
    if (!current.lease || current.lease.token !== token || current.lease.expiresAt <= now) throw new LeaseConflictError()
    const cancellationRace = current.revision === expectedRevision + 1 && current.cancellationRequested
    if (current.revision !== expectedRevision && !cancellationRace) throw new RevisionConflictError()
    const next = { ...current, lease: { token, expiresAt } }
    this.snapshots.set(id, clone(next)); return clone(next)
  }

  async commit(snapshot: WorkflowSnapshot, expectedRevision: number, leaseToken: string, now: number, releaseLease = true) {
    const current = this.required(snapshot.id)
    if (!current.lease || current.lease.token !== leaseToken) throw new LeaseConflictError()
    if (current.lease.expiresAt <= now) throw new LeaseConflictError()
    const cancellationRace = current.revision === expectedRevision + 1 && current.cancellationRequested && !snapshot.cancellationRequested
    if (current.revision !== expectedRevision && !cancellationRace) throw new RevisionConflictError()
    const next = { ...clone(snapshot), cancellationRequested: snapshot.cancellationRequested || current.cancellationRequested, revision: current.revision + 1, lease: releaseLease ? undefined : current.lease }
    this.snapshots.set(next.id, clone(next)); return clone(next)
  }

  async requestCancellation(id: string, expectedRevision: number, now: number) {
    const current = this.required(id)
    if (current.revision !== expectedRevision) throw new RevisionConflictError()
    const next = { ...current, cancellationRequested: true, revision: current.revision + 1, updatedAt: now }
    this.snapshots.set(id, clone(next)); return clone(next)
  }

  private required(id: string) { const value = this.snapshots.get(id); if (!value) throw new Error(`Workflow not found: ${id}`); return value }
}
