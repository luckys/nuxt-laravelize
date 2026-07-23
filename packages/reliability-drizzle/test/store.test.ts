/* eslint-disable @stylistic/max-statements-per-line */
import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import { createEnvelope, OutboxMessageConflictError } from '@nuxt-laravelize/reliability'
import { DeadLetterAmbiguousError, DeadLetterOperationConflictError, DeadLetterStaleRevisionError, DeadLetterUnmanagedLegacyError, deadLetterOperationFingerprint } from '@nuxt-laravelize/dead-letter'
import { DrizzlePostgresReliabilityStore, DrizzleReliabilityDeadLetterAdapter, DrizzleSQLiteReliabilityStore } from '../src/index.js'

describe('drizzle reliability stores', () => {
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('uses parameterized transaction-bound append', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ id: envelope.id }] }) }
    const store = new Store(database)
    await store.appendWith(database, envelope, { availableAt: new Date(1000).toISOString() })
    expect(database.execute).toHaveBeenCalledOnce()
    expect((database.execute.mock.calls[0]![0] as {
      queryChunks: unknown[]
    }).queryChunks.length).toBeGreaterThan(1)
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('appends with the exact unit-of-work session', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const session = { execute: vi.fn().mockResolvedValue({ rows: [{ id: envelope.id }] }) }
    const store = new Store({ execute: vi.fn() })

    await store.appendIn({ session, afterCommit: vi.fn() }, envelope, { availableAt: new Date(1000).toISOString() })

    expect(session.execute).toHaveBeenCalledOnce()
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('normalizes synchronous execute results', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-sync', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const execute = vi.fn(() => ({ rows: [{ id: envelope.id }] }))
    const store = new Store({ execute })

    await expect(store.append(envelope)).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledOnce()
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('accepts identical conflicts and rejects changed schedules', async (Store) => {
    const envelope = { version: 1 as const, id: 'same', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const identical = { execute: vi.fn().mockResolvedValue({ rows: [{ id: envelope.id }] }) }
    await expect(new Store(identical).append(envelope)).resolves.toBeUndefined()
    const changed = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    await expect(new Store(changed).append(envelope)).rejects.toBeInstanceOf(OutboxMessageConflictError)
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('rejects invalid availability before SQL execution', async (Store) => {
    const database = { execute: vi.fn() }
    await expect(new Store(database).append({ version: 1, id: 'bad', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }, { availableAt: 'tomorrow' })).rejects.toThrow(TypeError)
    expect(database.execute).not.toHaveBeenCalled()
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('maps JSON text or JSONB objects, freezes them and marks itself durable', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: { nested: true } }
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ envelope, state: 'processing', attempts: 1, available_at: envelope.occurredAt, lease_owner: 'worker', lease_token: 'claim:m-1', lease_until: new Date(1000).toISOString() }] }) }
    const store = new Store(database)
    const claimed = await store.claim({ owner: 'worker', token: 'claim', limit: 1, now: envelope.occurredAt, leaseUntil: new Date(1000).toISOString() })
    expect(claimed[0]?.envelope).toEqual(envelope)
    expect(Object.isFrozen(claimed[0]?.envelope.payload)).toBe(true)
    expect(store.durability).toBe('durable')
  })
  it('normalizes PostgreSQL timestamp text returned by the driver', async () => {
    const envelope = { version: 1 as const, id: 'postgres-time', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ envelope, state: 'processing', attempts: 1, available_at: '1970-01-01 00:00:00.200+00', lease_owner: 'worker', lease_token: 'claim:postgres-time', lease_until: '1970-01-01 00:00:30.200+00' }] }) }

    const claimed = await new DrizzlePostgresReliabilityStore(database).claim({ owner: 'worker', token: 'claim', limit: 1, now: envelope.occurredAt, leaseUntil: new Date(1000).toISOString() })

    expect(claimed[0]).toMatchObject({ availableAt: new Date(200).toISOString(), leaseUntil: new Date(30_200).toISOString() })
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('prunes terminal rows in bounded filtered batches', async (Store) => {
    const database = { execute: vi.fn().mockResolvedValueOnce({ rows: [{ id: 'one' }, { id: 'two' }] }).mockResolvedValueOnce({ rows: [{ id: 'three' }] }) }
    const result = await new Store(database).prune({
      namespace: 'outbox',
      completedBefore: new Date(1000).toISOString(),
      states: ['delivered'],
      types: ['workflow.wake.v1'],
      limit: 2,
    })
    expect(result).toEqual({ deleted: 2, hasMore: true })
    expect(database.execute).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(database.execute.mock.calls[0]![0])).toContain('reliability_dead_letter_operations')
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('records authoritative terminal transition time', async (Store) => {
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ id: 'done' }] }) }
    await new Store(database).delivered('outbox', 'done', 'lease', new Date(100).toISOString())
    expect(database.execute).toHaveBeenCalledOnce()
    expect(JSON.stringify(database.execute.mock.calls[0]![0])).toContain('terminal_at')
  })
  it('executes terminal retention against real SQLite', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const migration of ['0001_reliability_sqlite.sql', '0003_reliability_append_availability_sqlite.sql', '0005_reliability_terminal_at_sqlite.sql', '0007_reliability_dead_letter_management_sqlite.sql', '0009_reliability_dead_letter_operations_sqlite.sql'])
        sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
      const dialect = new SQLiteSyncDialect()
      const database = { execute(query: SQL) {
        const built = dialect.sqlToQuery(query)
        return { rows: sqlite.prepare(built.sql).all(...built.params as SQLInputValue[]) }
      } }
      const store = new DrizzleSQLiteReliabilityStore(database)
      const finish = async (id: string, type: string, terminal: 'delivered' | 'dead', at: number) => {
        await store.append(createEnvelope({ id, type, occurredAt: new Date(0).toISOString(), payload: null }))
        const [claimed] = await store.claim({ owner: 'sqlite', token: id, limit: 1, now: new Date(0).toISOString(), leaseUntil: new Date(1000).toISOString() })
        if (terminal === 'delivered') await store.delivered('outbox', id, claimed!.leaseToken!, new Date(at).toISOString())
        else await store.dead('outbox', id, claimed!.leaseToken!, new Date(at).toISOString(), 'retain')
      }
      await finish('old', 'workflow.wake.v1', 'delivered', 100)
      await finish('boundary', 'workflow.wake.v1', 'delivered', 200)
      await finish('dead', 'workflow.wake.v1', 'dead', 100)
      await finish('other', 'other.v1', 'delivered', 100)

      await expect(store.prune({ namespace: 'outbox', completedBefore: new Date(200).toISOString(), states: ['delivered'], types: ['workflow.wake.v1'], limit: 1 })).resolves.toEqual({ deleted: 1, hasMore: false })
      expect(sqlite.prepare('select id from reliability_messages order by id').all().map(row => row.id)).toEqual(['boundary', 'dead', 'other'])
    }
    finally {
      sqlite.close()
    }
  })
  it('leaves a receipt pending after a transient CAS database error and never re-executes', async () => {
    const request = { key: { source: 'reliability', namespace: 'outbox', id: 'a' }, revision: '1', operationId: 'transient' }; const pending = { operation_id: 'transient', fingerprint: await deadLetterOperationFingerprint('discard', request), message_kind: 'outbox', message_id: 'a', action: 'discard', status: 'pending' }
    const database = { execute: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ rows: [pending] }).mockResolvedValueOnce({ rows: [] }) }
    const adapter = new DrizzleReliabilityDeadLetterAdapter(database)
    await expect(adapter.discard(request)).rejects.toBeInstanceOf(DeadLetterAmbiguousError)
    await expect(adapter.discard(request)).rejects.toBeInstanceOf(DeadLetterAmbiguousError)
    expect(database.execute).toHaveBeenCalledTimes(5)
  })
  it.each(['01', '9007199254740992', 'Infinity'])('rejects non-canonical or unsafe reliability revision %s before reserving', async (revision) => {
    const database = { execute: vi.fn() }
    const adapter = new DrizzleReliabilityDeadLetterAdapter(database)

    await expect(adapter.discard({ key: { source: 'reliability', namespace: 'outbox', id: 'a' }, revision, operationId: `invalid-${revision}` })).rejects.toBeInstanceOf(DeadLetterStaleRevisionError)
    expect(database.execute).not.toHaveBeenCalled()
  })
  it('manages real SQLite dead letters with private pages and atomic CAS receipts', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const migration of ['0001_reliability_sqlite.sql', '0003_reliability_append_availability_sqlite.sql', '0005_reliability_terminal_at_sqlite.sql', '0007_reliability_dead_letter_management_sqlite.sql', '0009_reliability_dead_letter_operations_sqlite.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
      const dialect = new SQLiteSyncDialect()
      const database = { execute(query: SQL) { const built = dialect.sqlToQuery(query); return { rows: sqlite.prepare(built.sql).all(...built.params as SQLInputValue[]) } } }
      const store = new DrizzleSQLiteReliabilityStore(database); const terminalAt = new Date(100).toISOString()
      for (const id of ['a', 'b']) {
        await store.append(createEnvelope({ id, type: 'webhook.deliver.v1', occurredAt: new Date(0).toISOString(), payload: { secret: id }, context: { tenantId: 'hint-only' } }))
        const [claimed] = await store.claim({ owner: 'worker', token: id, limit: 1, now: new Date(0).toISOString(), leaseUntil: new Date(1000).toISOString() })
        await store.dead('outbox', id, claimed!.leaseToken!, terminalAt, 'token=private\nstack')
      }
      const adapter = new DrizzleReliabilityDeadLetterAdapter(database, () => new Date(200))
      const first = await adapter.list({ namespace: 'outbox', limit: 1 })
      expect(first.items[0]).not.toHaveProperty('payload'); expect(first.items[0]).not.toHaveProperty('tenantHint'); expect(first.items[0]).not.toHaveProperty('error')
      expect((await adapter.list({ namespace: 'outbox', limit: 1, includeErrorSummary: true })).items[0]?.error).toBe('token=[redacted] stack')
      expect((await adapter.list({ namespace: 'outbox', limit: 1, cursor: first.nextCursor })).items[0]?.key.id).toBe('b')
      expect(await adapter.get(first.items[0]!.key, { includePayload: true })).toHaveProperty('payload.secret', 'a')
      const request = { key: first.items[0]!.key, revision: first.items[0]!.revision, operationId: 'discard-a', reason: 'reviewed' }
      await expect(adapter.discard({ ...request, revision: '999', operationId: 'stale-discard-a' })).rejects.toBeInstanceOf(DeadLetterStaleRevisionError)
      const committed = await adapter.discard(request); expect(await adapter.discard(request)).toEqual(committed)
      await expect(adapter.discard({ ...request, reason: 'different' })).rejects.toBeInstanceOf(DeadLetterOperationConflictError)
      sqlite.prepare('insert into reliability_dead_letter_operations (operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at) values (\'pending-discard-a\', \'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\', \'reliability\', \'outbox\', \'a\', \'discard\', \'pending\', ?)').run(terminalAt)
      sqlite.prepare('insert into reliability_dead_letter_operations (operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at) values (\'retry-b\', \'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\', \'reliability\', \'outbox\', \'b\', \'retry\', \'pending\', ?)').run(terminalAt)
      sqlite.prepare('update reliability_messages set management_operation_id = null where id in (\'a\', \'b\')').run()
      await expect(store.prune({ namespace: 'outbox', completedBefore: new Date(200).toISOString(), states: ['dead'], allowDeadEvidenceDeletion: true, limit: 10 })).resolves.toEqual({ deleted: 0, hasMore: false })
      await expect(store.prune({ namespace: 'outbox', completedBefore: new Date(200).toISOString(), states: ['dead'], allowDeadEvidenceDeletion: true, allowActiveDeadEvidenceDeletion: true, limit: 10 })).resolves.toEqual({ deleted: 0, hasMore: false })
      expect(sqlite.prepare('select id from reliability_messages where id in (\'a\', \'b\') order by id').all().map(row => row.id)).toEqual(['a', 'b'])
      expect(sqlite.prepare('select count(*) as count from reliability_dead_letter_operations where operation_id in (\'discard-a\', \'pending-discard-a\', \'retry-b\')').get()).toEqual({ count: 3 })
      sqlite.prepare('update reliability_messages set terminal_at = null where id = \'b\'').run()
      expect((await adapter.list({ namespace: 'outbox' })).items.map(item => item.key.id)).not.toContain('b')
      await expect(adapter.get({ source: 'reliability', namespace: 'outbox', id: 'b' })).rejects.toBeInstanceOf(DeadLetterUnmanagedLegacyError)
      expect(sqlite.prepare('select length(fingerprint) as length, status from reliability_dead_letter_operations where operation_id = \'discard-a\'').get()).toEqual({ length: 64, status: 'committed' })
    }
    finally { sqlite.close() }
  })
})
