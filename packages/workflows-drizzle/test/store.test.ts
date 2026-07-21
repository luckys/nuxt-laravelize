import { PgDialect } from 'drizzle-orm/pg-core'
import { SQLiteAsyncDialect, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { LeaseConflictError, RevisionConflictError, StartKeyConflictError, type WorkflowSnapshot } from '@nuxt-laravelize/workflows'
import { DrizzlePostgresWorkflowStore, DrizzleSQLiteWorkflowStore, TursoWorkflowStore, type DrizzlePostgresWorkflowDatabase, type DrizzleSQLiteWorkflowDatabase } from '../src/index.js'

type Row = Record<string, unknown>
const snapshot = (overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot => ({ id: 'wf-1', workflowName: 'orders', workflowVersion: '1', startKey: 'start-1', canonicalInput: '{"order":1}', input: { order: 1 }, state: 'pending', revision: 0, steps: [{ name: 'charge', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'wf-1:charge' }], cancellationRequested: false, createdAt: 100, updatedAt: 100, ...overrides })
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
    const persisted = row(snapshot({ revision: 1, state: 'running', cancellationRequested: true, lease: { token: 'db', expiresAt: 500 }, updatedAt: 120 }))
    persisted.snapshot = JSON.stringify(snapshot({ revision: 99, state: 'failed', lease: { token: 'json', expiresAt: 1 } }))
    await expect(adapter([persisted]).store.get('wf-1')).resolves.toEqual(snapshot({ revision: 1, state: 'running', cancellationRequested: true, lease: { token: 'db', expiresAt: 500 }, updatedAt: 120 }))
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

  it('claims with one conditional update and classifies revision and lease conflicts', async () => {
    const claimed = snapshot({ revision: 2, lease: { token: 'new', expiresAt: 900 }, updatedAt: 200 })
    const success = adapter([row(claimed)])
    await expect(success.store.claim('wf-1', 1, 'new', 200, 900)).resolves.toEqual(claimed)
    expect(success.call).toHaveBeenCalledOnce()
    await expect(adapter([], [row(snapshot({ revision: 2 }))]).store.claim('wf-1', 1, 'new', 200, 900)).rejects.toBeInstanceOf(RevisionConflictError)
    await expect(adapter([], [row(snapshot({ revision: 1, lease: { token: 'old', expiresAt: 300 } }))]).store.claim('wf-1', 1, 'new', 200, 900)).rejects.toBeInstanceOf(LeaseConflictError)
  })

  it('fences commits and preserves the one-revision cancellation race', async () => {
    const committed = snapshot({ revision: 3, state: 'completed', cancellationRequested: true, updatedAt: 250 })
    await expect(adapter([row(committed)]).store.commit(snapshot({ revision: 2, state: 'completed', updatedAt: 250 }), 1, 'lease', 200)).resolves.toEqual(committed)
    await expect(adapter([], [row(snapshot({ revision: 1, lease: { token: 'other', expiresAt: 300 } }))]).store.commit(snapshot(), 1, 'lease', 200)).rejects.toBeInstanceOf(LeaseConflictError)
    await expect(adapter([], [row(snapshot({ revision: 3, lease: { token: 'lease', expiresAt: 300 } }))]).store.commit(snapshot(), 1, 'lease', 200)).rejects.toBeInstanceOf(RevisionConflictError)
  })

  it('rejects changed input, non-plain JSON objects, and unsafe epochs', async () => {
    await expect(adapter().store.commit(snapshot({ input: { order: 2 } }), 0, 'lease', 100)).rejects.toThrow('canonicalInput must match workflow input')
    await expect(adapter([], [row()]).store.commit(snapshot({ input: { order: 2 }, canonicalInput: '{"order":2}' }), 0, 'lease', 100)).rejects.toBeInstanceOf(StartKeyConflictError)
    await expect(adapter().store.create(snapshot({ input: { date: new Date() } as never, canonicalInput: '{}' }))).rejects.toThrow('plain objects')
    await expect(adapter().store.claim('wf-1', 0, 'x', Number.MAX_SAFE_INTEGER + 1, 3)).rejects.toThrow(TypeError)
  })
})

it('supports async SQLite/Turso all(SQL) and SQLiteAsyncDialect rendering', async () => {
  const dialect = new SQLiteAsyncDialect()
  const all = vi.fn(async (query: SQL) => {
    expect(dialect.sqlToQuery(query).params).toEqual(['wf-1', 1])
    return [row()]
  })
  await expect(new TursoWorkflowStore({ all }).get('wf-1')).resolves.toEqual(snapshot())
})
