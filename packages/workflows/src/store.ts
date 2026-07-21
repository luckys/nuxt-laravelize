/* eslint-disable @stylistic/max-statements-per-line */
import type { WorkflowSnapshot } from './types'

export class StartKeyConflictError extends Error { constructor() { super('Start key already exists with different workflow or input'); this.name = 'StartKeyConflictError' } }
export class RevisionConflictError extends Error { constructor() { super('Workflow revision is stale'); this.name = 'RevisionConflictError' } }
export class LeaseConflictError extends Error { constructor() { super('Workflow lease is stale or unavailable'); this.name = 'LeaseConflictError' } }

export interface WorkflowStore {
  create(snapshot: WorkflowSnapshot): Promise<{ snapshot: WorkflowSnapshot, created: boolean }>
  get(id: string): Promise<WorkflowSnapshot | null>
  claim(id: string, expectedRevision: number, token: string, now: number, expiresAt: number): Promise<WorkflowSnapshot>
  /** Fences revision/lease, merges a concurrent cancellation, and optionally retains the lease. */
  commit(snapshot: WorkflowSnapshot, expectedRevision: number, leaseToken: string, now: number, releaseLease?: boolean): Promise<WorkflowSnapshot>
  requestCancellation(id: string, expectedRevision: number, now: number): Promise<WorkflowSnapshot>
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

  async claim(id: string, expectedRevision: number, token: string, now: number, expiresAt: number) {
    const current = this.required(id)
    if (current.revision !== expectedRevision) throw new RevisionConflictError()
    if (current.lease && current.lease.expiresAt > now) throw new LeaseConflictError()
    const next = { ...current, revision: current.revision + 1, lease: { token, expiresAt }, updatedAt: now }
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
