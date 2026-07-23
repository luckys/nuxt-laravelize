import { PgDialect } from 'drizzle-orm/pg-core'
import { SQLiteAsyncDialect, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { InvalidWorkflowSnapshotError, InvalidWorkflowVersionError, LeaseConflictError, normalizePersistedWorkflowSnapshot, RevisionConflictError, StartKeyConflictError, UnsupportedWorkflowSnapshotFormatError, WorkflowIdentityConflictError, type WorkflowSnapshot } from '@nuxt-laravelize/workflows'
import { DrizzlePostgresWorkflowStore, DrizzleSQLiteWorkflowStore, TursoWorkflowStore, type DrizzlePostgresWorkflowDatabase, type DrizzleSQLiteWorkflowDatabase } from '../src/index.js'

type Row = Record<string, unknown>
const snapshot = (overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot => ({ snapshotFormatVersion: 1, id: 'wf-1', workflowName: 'orders', workflowVersion: '1', startKey: 'start-1', canonicalInput: '{"order":1}', input: { order: 1 }, state: 'pending', revision: 0, steps: [{ name: 'charge', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'wf-1:charge' }], cancellationRequested: false, createdAt: 100, updatedAt: 100, ...overrides })
const row = (value = snapshot()) => ({ id: value.id, workflow_name: value.workflowName, workflow_version: value.workflowVersion, start_key: value.startKey, canonical_input: value.canonicalInput, snapshot: JSON.stringify(value), state: value.state, revision: value.revision, cancellation_requested: value.cancellationRequested, lease_token: value.lease?.token ?? null, lease_expires_at: value.lease?.expiresAt ?? null, created_at: value.createdAt, updated_at: value.updatedAt })

const postgres = (...results: Row[][]) => {
  const dialect = new PgDialect()
  const execute = vi.fn((query: SQL) => {
    dialect.sqlToQuery(query)
    return { rows: results.shift() ?? [] }
  })
  return { store: new DrizzlePostgresWorkflowStore({ execute }), call: execute, render: (query: SQL) => dialect.sqlToQuery(query) }
}

const sqlite = (...results: Row[][]) => {
  const dialect = new SQLiteSyncDialect()
  const all = vi.fn((query: SQL) => {
    dialect.sqlToQuery(query)
    return results.shift() ?? []
  })
  return { store: new DrizzleSQLiteWorkflowStore({ all }), call: all, render: (query: SQL) => dialect.sqlToQuery(query) }
}

const adapters = [postgres, sqlite] as const

function constructorContracts(postgresDatabase: DrizzlePostgresWorkflowDatabase, sqliteDatabase: DrizzleSQLiteWorkflowDatabase) {
  expectTypeOf(new DrizzlePostgresWorkflowStore(postgresDatabase)).toMatchTypeOf<DrizzlePostgresWorkflowStore>()
  expectTypeOf(new DrizzleSQLiteWorkflowStore(sqliteDatabase)).toMatchTypeOf<DrizzleSQLiteWorkflowStore>()
  expectTypeOf(new TursoWorkflowStore(sqliteDatabase)).toMatchTypeOf<TursoWorkflowStore>()
  // @ts-expect-error PostgreSQL requires execute(SQL), not SQLite all(SQL)
  new DrizzlePostgresWorkflowStore(sqliteDatabase)
  // @ts-expect-error SQLite requires all(SQL), not PostgreSQL execute(SQL).
  new DrizzleSQLiteWorkflowStore(postgresDatabase)
}
void constructorContracts

describe.each(adapters)('workflow adapter %#', (adapter) => {
  it('creates atomically using parameterized dialect-renderable SQL', async () => {
    const context = adapter([row()])
    await expect(context.store.create(snapshot())).resolves.toEqual({ snapshot: snapshot(), created: true })
    const query = context.call.mock.calls[0]![0]
    const rendered = context.render(query)
    expect(rendered.params).toContain('wf-1')
    expect(rendered.sql).not.toContain('\'wf-1\'')
    expect(context.call).toHaveBeenCalledOnce()
  })

  it('returns idempotent creation and classifies creation conflicts', async () => {
    await expect(adapter([], [row()]).store.create(snapshot({ id: 'other' }))).resolves.toEqual({ snapshot: snapshot(), created: false })
    await expect(adapter([], [row()]).store.create(snapshot({ id: 'other', canonicalInput: '{}', input: {} }))).rejects.toBeInstanceOf(StartKeyConflictError)
    await expect(adapter([], [row(snapshot({ workflowName: 'other' }))]).store.create(snapshot())).rejects.toBeInstanceOf(StartKeyConflictError)
  })

  it('hydrates relational fields authoritatively', async () => {
    const steps = [{ ...snapshot().steps[0]!, state: 'committed' as const, attempts: 1, output: null }]
    const persisted = row(snapshot({ revision: 1, state: 'running', steps, cancellationRequested: true, lease: { token: 'db', expiresAt: 500 }, updatedAt: 120 }))
    persisted.snapshot = JSON.stringify(snapshot({ workflowName: 'json-name', workflowVersion: 'json-version', startKey: 'json-key', canonicalInput: '{}', createdAt: 1, revision: 99, state: 'failed', steps, lease: { token: 'json', expiresAt: 1 } }))
    await expect(adapter([persisted]).store.get('wf-1')).resolves.toEqual(snapshot({ revision: 1, state: 'running', steps, cancellationRequested: true, lease: { token: 'db', expiresAt: 500 }, updatedAt: 120 }))
  })

  it('normalizes legacy format, rejects unknown formats and invalid relational versions, and always serializes format 1', async () => {
    const legacy = row()
    const body = JSON.parse(legacy.snapshot as string)
    delete body.snapshotFormatVersion
    legacy.snapshot = JSON.stringify(body)
    await expect(adapter([legacy]).store.get('wf-1')).resolves.toMatchObject({ snapshotFormatVersion: 1 })

    const unknown = row()
    unknown.snapshot = JSON.stringify({ ...snapshot(), snapshotFormatVersion: 2 })
    await expect(adapter([unknown]).store.get('wf-1')).rejects.toBeInstanceOf(UnsupportedWorkflowSnapshotFormatError)
    const invalidVersion = row()
    invalidVersion.workflow_version = 'latest'
    await expect(adapter([invalidVersion]).store.get('wf-1')).rejects.toBeInstanceOf(InvalidWorkflowVersionError)

    const context = adapter([row()])
    await context.store.create(snapshot())
    const rendered = context.render(context.call.mock.calls[0]![0])
    expect(rendered.params.some(value => typeof value === 'string' && value.includes('"snapshotFormatVersion":1'))).toBe(true)
  })

  it.each([
    ['waiting_retry', { state: 'waiting_retry', attempts: 1, retryAt: 101, error: { name: '', message: 'M'.repeat(5000) } }],
    ['failed', { state: 'failed', attempts: 1, error: { name: 'N'.repeat(256), message: 'M'.repeat(5000) } }],
    ['compensation_waiting_retry', { state: 'compensation_waiting_retry', attempts: 1, compensationAttempts: 1, compensationIdempotencyKey: 'wf-1:compensate:0', output: null, retryAt: 101, error: { name: '', message: 'M'.repeat(5000) } }],
    ['compensation_failed', { state: 'compensation_failed', attempts: 1, compensationAttempts: 1, compensationIdempotencyKey: 'wf-1:compensate:0', output: null, error: { name: 'N'.repeat(256), message: 'M'.repeat(5000) } }],
  ] as const)('hydrates bounded previous-release errors for %s rows', async (state, step) => {
    const legacy = snapshot({ state, steps: [{ ...snapshot().steps[0]!, ...step }] })
    const hydrated = await adapter([row(legacy)]).store.get('wf-1')
    expect(hydrated?.steps[0]!.error?.name).toBe(state === 'waiting_retry' || state === 'compensation_waiting_retry' ? 'Error' : 'N'.repeat(128))
    expect(hydrated?.steps[0]!.error?.message).toBe('M'.repeat(4096))
  })

  it('normalizes legacy errors on get and persists normalized JSON before lease and cancellation receipts', async () => {
    const legacy = snapshot({ state: 'waiting_retry', steps: [{ ...snapshot().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 101, error: { name: '', message: 'M'.repeat(5000) } }] })
    const normalized = normalizePersistedWorkflowSnapshot(legacy)

    await expect(adapter([row(legacy)]).store.get('wf-1')).resolves.toEqual(normalized)

    const claimed = { ...normalized, revision: 1, lease: { token: 'lease', expiresAt: 500 }, updatedAt: 200 }
    const claim = adapter([row(legacy)], [row(claimed)])
    await expect(claim.store.claim('wf-1', 0, 'lease', 200, 500)).resolves.toEqual(claimed)
    expect(claim.render(claim.call.mock.calls[1]![0]).params).toContain(JSON.stringify(normalized))

    const renewed = { ...claimed, lease: { token: 'lease', expiresAt: 700 } }
    const renew = adapter([row(claimed)], [row(renewed)])
    await expect(renew.store.renewLease('wf-1', 1, 'lease', 250, 700)).resolves.toEqual(renewed)
    expect(renew.render(renew.call.mock.calls[1]![0]).params).toContain(JSON.stringify(claimed))

    const cancelled = { ...claimed, revision: 2, cancellationRequested: true, updatedAt: 250 }
    const cancellation = adapter([row(claimed)], [row(cancelled)])
    await expect(cancellation.store.requestCancellation('wf-1', 1, 250)).resolves.toEqual(cancelled)
    expect(cancellation.render(cancellation.call.mock.calls[1]![0]).params).toContain(JSON.stringify(claimed))
  })

  it('never compatibility-normalizes new insert or mutation RETURNING receipts', async () => {
    const malformed = row(snapshot({ state: 'waiting_retry', steps: [{ ...snapshot().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 101, error: { name: '', message: 'M'.repeat(5000) } }] }))
    await expect(adapter([malformed]).store.create(snapshot())).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    await expect(adapter([row()], [malformed]).store.claim('wf-1', 0, 'lease', 200, 500)).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)

    const leased = snapshot({ lease: { token: 'lease', expiresAt: 500 } })
    await expect(adapter([row(leased)], [malformed]).store.commit(leased, 0, 'lease', 200)).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
  })

  it('rejects terminal cancellation race rows before and after hydration', async () => {
    const legacy = snapshot({ state: 'failed', steps: [{ ...snapshot().steps[0]!, state: 'failed', attempts: 1, error: { name: '', message: 'M'.repeat(5000) } }] })
    const ambiguous = { ...legacy, cancellationRequested: true }
    expect(() => normalizePersistedWorkflowSnapshot(ambiguous)).toThrow(InvalidWorkflowSnapshotError)
    await expect(adapter([row(ambiguous)]).store.get('wf-1')).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
  })

  it('discovers a bounded page of non-terminal workflow IDs', async () => {
    const context = adapter([{ id: 'wf-1', updated_at: 100 }, { id: 'wf-2', updated_at: 100 }])
    await expect(context.store.discoverRecoverable({ updatedBefore: 200, limit: 2, cursor: { updatedAt: 50, id: 'old' } })).resolves.toEqual({
      workflowIds: ['wf-1', 'wf-2'],
      nextCursor: { updatedAt: 100, id: 'wf-2' },
    })
    const rendered = context.render(context.call.mock.calls[0]![0])
    expect(rendered.sql).toContain('order by updated_at asc, id asc')
    expect(rendered.params).toContain(200)
    expect(rendered.params).toContain('completed')
  })

  it('validates recovery bounds before querying', async () => {
    const context = adapter()
    await expect(context.store.discoverRecoverable({ updatedBefore: 1, limit: 1001 })).rejects.toThrow(TypeError)
    expect(context.call).not.toHaveBeenCalled()
  })

  it('claims with a normalized authoritative pre-read and conditional update', async () => {
    const claimed = snapshot({ revision: 2, lease: { token: 'new', expiresAt: 900 }, updatedAt: 200 })
    const success = adapter([row(snapshot({ revision: 1 }))], [row(claimed)])
    await expect(success.store.claim('wf-1', 1, 'new', 200, 900)).resolves.toEqual(claimed)
    expect(success.call).toHaveBeenCalledTimes(2)
    await expect(adapter([row(snapshot({ revision: 1 }))], [], [row(snapshot({ revision: 2 }))]).store.claim('wf-1', 1, 'new', 200, 900)).rejects.toBeInstanceOf(RevisionConflictError)
    const leased = snapshot({ revision: 1, lease: { token: 'old', expiresAt: 300 } })
    await expect(adapter([row(leased)], [], [row(leased)]).store.claim('wf-1', 1, 'new', 200, 900)).rejects.toBeInstanceOf(LeaseConflictError)
  })

  it('preserves monotonic claim and cancellation timestamps in SQL under clock skew', async () => {
    const claimed = snapshot({ revision: 1, lease: { token: 'slow', expiresAt: 300 }, updatedAt: 200 })
    const claimContext = adapter([row(snapshot())], [row(claimed)])
    await expect(claimContext.store.claim('wf-1', 0, 'slow', 100, 300)).resolves.toEqual(claimed)
    expect(claimContext.render(claimContext.call.mock.calls[1]![0]).sql).toContain('case when updated_at >')

    const cancelled = snapshot({ revision: 2, cancellationRequested: true, lease: { token: 'slow', expiresAt: 300 }, updatedAt: 200 })
    const cancellationContext = adapter([row(claimed)], [row(cancelled)])
    await expect(cancellationContext.store.requestCancellation('wf-1', 1, 100)).resolves.toEqual(cancelled)
    expect(cancellationContext.render(cancellationContext.call.mock.calls[1]![0]).sql).toContain('case when updated_at >')
  })

  it('renews only an owned live lease without revision churn', async () => {
    const renewed = snapshot({ revision: 2, cancellationRequested: true, lease: { token: 'lease', expiresAt: 900 }, updatedAt: 100 })
    const success = adapter([row(renewed)], [row(renewed)])
    await expect(success.store.renewLease('wf-1', 1, 'lease', 200, 900)).resolves.toEqual(renewed)
    const rendered = new PgDialect().sqlToQuery(success.call.mock.calls[1]![0])
    expect(rendered.sql).toContain('lease_expires_at = case when lease_expires_at >')
    expect(rendered.sql).not.toContain('revision = revision +')
    expect(rendered.sql).not.toContain('updated_at =')
    const otherLease = snapshot({ revision: 1, lease: { token: 'other', expiresAt: 300 } })
    await expect(adapter([row(otherLease)], [], [row(otherLease)]).store.renewLease('wf-1', 1, 'lease', 200, 900)).rejects.toBeInstanceOf(LeaseConflictError)
    const newer = snapshot({ revision: 3, lease: { token: 'lease', expiresAt: 300 } })
    await expect(adapter([row(newer)], [], [row(newer)]).store.renewLease('wf-1', 1, 'lease', 200, 900)).rejects.toBeInstanceOf(RevisionConflictError)
  })

  it('preserves a longer authoritative lease during a backward-clock renewal', async () => {
    const renewed = snapshot({ revision: 1, lease: { token: 'lease', expiresAt: 1_000 } })
    const context = adapter([row(renewed)], [row(renewed)])
    await expect(context.store.renewLease('wf-1', 1, 'lease', 50, 500)).resolves.toEqual(renewed)
    const rendered = context.render(context.call.mock.calls[1]![0])
    expect(rendered.sql).toContain('case when lease_expires_at >')
    expect(rendered.params.filter(value => value === 500)).toHaveLength(2)
  })

  it('fences final completion from a one-revision cancellation race', async () => {
    const completedSteps = [{ ...snapshot().steps[0]!, state: 'committed' as const, attempts: 1, output: null }]
    const cancelledCurrent = snapshot({ revision: 2, state: 'running', steps: completedSteps, cancellationRequested: true, lease: { token: 'lease', expiresAt: 300 }, updatedAt: 200 })
    const raced = adapter([row(cancelledCurrent)], [], [row(cancelledCurrent)])
    await expect(raced.store.commit(snapshot({ revision: 1, state: 'completed', steps: completedSteps, updatedAt: 250, lease: { token: 'lease', expiresAt: 300 } }), 1, 'lease', 200)).rejects.toBeInstanceOf(RevisionConflictError)
    const rendered = raced.render(raced.call.mock.calls[1]![0])
    expect(rendered.sql).toContain('workflow_name =')
    expect(rendered.sql).toContain('workflow_version =')
    expect(rendered.sql).toContain('start_key =')
    expect(rendered.sql).toContain('created_at =')
    expect(rendered.params).toContain('completed')
    await expect(adapter([row(snapshot({ revision: 1, lease: { token: 'other', expiresAt: 300 } }))], [], [row(snapshot({ revision: 1, lease: { token: 'other', expiresAt: 300 } }))]).store.commit(snapshot(), 1, 'lease', 200)).rejects.toBeInstanceOf(LeaseConflictError)
    await expect(adapter([row(snapshot({ revision: 3, lease: { token: 'lease', expiresAt: 300 } }))], [], [row(snapshot({ revision: 3, lease: { token: 'lease', expiresAt: 300 } }))]).store.commit(snapshot(), 1, 'lease', 200)).rejects.toBeInstanceOf(RevisionConflictError)
  })

  it('fences terminal failure from a one-revision cancellation race', async () => {
    const failedSteps = [{ ...snapshot().steps[0]!, state: 'failed' as const, attempts: 1, error: { name: 'Error', message: 'failed' } }]
    const current = snapshot({ revision: 2, state: 'running', steps: [{ ...snapshot().steps[0]!, state: 'running', attempts: 1 }], cancellationRequested: true, lease: { token: 'lease', expiresAt: 300 }, updatedAt: 200 })
    const context = adapter([row(current)], [], [row(current)])
    await expect(context.store.commit(snapshot({ revision: 1, state: 'failed', steps: failedSteps, lease: { token: 'lease', expiresAt: 300 }, updatedAt: 200 }), 1, 'lease', 200)).rejects.toBeInstanceOf(RevisionConflictError)
    expect(context.render(context.call.mock.calls[1]![0]).sql).toContain('<>')
  })

  it('fences direct terminal cancellation and validates mutation arguments before querying', async () => {
    const terminal = completedSnapshotRow()
    const terminalContext = adapter([terminal], [], [terminal])
    await expect(terminalContext.store.requestCancellation('wf-1', 0, 100)).rejects.toBeInstanceOf(RevisionConflictError)
    expect(terminalContext.render(terminalContext.call.mock.calls[1]![0]).sql).toContain('state <>')

    const invalid = adapter()
    await expect(invalid.store.claim('wf-1', -1, 'lease', 0, 1)).rejects.toThrow(TypeError)
    await expect(invalid.store.claim('wf-1', 0, '', 0, 1)).rejects.toThrow(TypeError)
    await expect(invalid.store.renewLease('wf-1', 0, 'lease', 0, 8_640_000_000_000_001)).rejects.toThrow(TypeError)
    await expect(invalid.store.requestCancellation('wf-1', 0, -1)).rejects.toThrow(TypeError)
    await expect(invalid.store.commit(snapshot(), -1, 'lease', 100)).rejects.toThrow(TypeError)
    expect(invalid.call).not.toHaveBeenCalled()
  })

  it('keeps the newer cancellation updatedAt when merging a worker commit', async () => {
    const steps = [{ ...snapshot().steps[0]!, state: 'running' as const, attempts: 1 }]
    const current = snapshot({ revision: 2, state: 'running', steps, cancellationRequested: true, lease: { token: 'lease', expiresAt: 300 }, updatedAt: 200 })
    const committed = { ...current, revision: 3 }
    const context = adapter([row(current)], [row(committed)])
    const candidate = snapshot({ revision: 1, state: 'running', steps, lease: { token: 'lease', expiresAt: 300 }, updatedAt: 100 })

    await expect(context.store.commit(candidate, 1, 'lease', 100, false)).resolves.toMatchObject({ cancellationRequested: true, updatedAt: 200 })
    const rendered = context.render(context.call.mock.calls[1]![0])
    expect(rendered.sql).toContain('case when updated_at >')
  })

  it('rejects changed input, non-plain JSON objects, and unsafe epochs', async () => {
    await expect(adapter().store.commit(snapshot({ input: { order: 2 } }), 0, 'lease', 100)).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    await expect(adapter([row()]).store.commit(snapshot({ input: { order: 2 }, canonicalInput: '{"order":2}' }), 0, 'lease', 100)).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
    await expect(adapter([row()]).store.commit(snapshot({ workflowVersion: '2' }), 0, 'lease', 100)).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
    await expect(adapter([row()]).store.commit(snapshot({ steps: [{ ...snapshot().steps[0]!, idempotencyKey: 'changed' }] }), 0, 'lease', 100)).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
    await expect(adapter().store.create(snapshot({ input: { date: new Date() } as never, canonicalInput: '{}' }))).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    await expect(adapter().store.claim('wf-1', 0, 'x', Number.MAX_SAFE_INTEGER + 1, 3)).rejects.toThrow(TypeError)
  })
})

function completedSnapshotRow(): Row {
  return row(snapshot({ state: 'completed', steps: [{ ...snapshot().steps[0]!, state: 'committed', attempts: 1, output: null }] }))
}

it('supports async SQLite/Turso all(SQL) and SQLiteAsyncDialect rendering', async () => {
  const dialect = new SQLiteAsyncDialect()
  const all = vi.fn(async (query: SQL) => {
    expect(dialect.sqlToQuery(query).params).toEqual(['wf-1', 1])
    return [row()]
  })
  await expect(new TursoWorkflowStore({ all }).get('wf-1')).resolves.toEqual(snapshot())
})
