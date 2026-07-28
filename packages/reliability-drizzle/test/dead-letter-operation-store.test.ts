/* eslint-disable @stylistic/max-statements-per-line */
import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { SQL } from 'drizzle-orm'
import { DeadLetterOperationConflictError } from '@nuxt-laravelize/dead-letter'
import { DrizzleDeadLetterOperationStore } from '../src/index.js'

const fingerprint = (character = 'a') => character.repeat(64)
const sqliteMigrations = ['0009_reliability_dead_letter_operations_sqlite.sql', '0011_generalize_dead_letter_operations_sqlite.sql']
const result = (revision = 'opaque:redis/fence==') => ({ key: { source: 'bullmq', namespace: 'emails', id: 'job-1' }, disposition: 'active' as const, revision, operationId: 'retry-job-1', committedAt: new Date(200).toISOString() })

function sqliteStore(sqlite: DatabaseSync, now = 100) {
  const dialect = new SQLiteSyncDialect()
  const database = { execute(query: SQL) { const built = dialect.sqlToQuery(query); return { rows: sqlite.prepare(built.sql).all(...built.params as SQLInputValue[]) } } }
  return new DrizzleDeadLetterOperationStore(database, () => new Date(now))
}

describe('DrizzleDeadLetterOperationStore', () => {
  it('atomically reserves once and preserves pending receipts across store instances', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const migration of sqliteMigrations) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
      const store = sqliteStore(sqlite)

      expect((await Promise.all([store.reserve('retry-job-1', fingerprint()), store.reserve('retry-job-1', fingerprint())])).sort()).toEqual(['exists', 'reserved'])
      await expect(sqliteStore(sqlite).get('retry-job-1')).resolves.toEqual({ fingerprint: fingerprint(), status: 'pending' })
      expect(sqlite.prepare('select count(*) as count from reliability_dead_letter_operations').get()).toEqual({ count: 1 })
    }
    finally { sqlite.close() }
  })

  it('round-trips opaque revisions and makes matching terminal finalization idempotent', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const migration of sqliteMigrations) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
      const store = sqliteStore(sqlite)
      await store.reserve('retry-job-1', fingerprint())
      await store.finalize('retry-job-1', fingerprint(), { status: 'committed', result: result() })
      await expect(store.finalize('retry-job-1', fingerprint(), { status: 'committed', result: result() })).resolves.toBeUndefined()
      await expect(store.get('retry-job-1')).resolves.toEqual({ fingerprint: fingerprint(), status: 'committed', result: result() })
    }
    finally { sqlite.close() }
  })

  it('fails closed for conflicts, malformed fingerprints, and different terminal resolutions', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const migration of sqliteMigrations) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
      const store = sqliteStore(sqlite)
      await expect(store.reserve('retry-job-1', 'not-a-fingerprint')).rejects.toThrow(TypeError)
      await store.reserve('retry-job-1', fingerprint())
      await expect(store.reserve('retry-job-1', fingerprint('b'))).resolves.toBe('exists')
      await expect(store.finalize('retry-job-1', fingerprint('b'), { status: 'failed', failureCode: 'not_found' })).rejects.toBeInstanceOf(DeadLetterOperationConflictError)
      await store.finalize('retry-job-1', fingerprint(), { status: 'failed', failureCode: 'stale_revision' })
      await expect(store.finalize('retry-job-1', fingerprint(), { status: 'failed', failureCode: 'not_found' })).rejects.toBeInstanceOf(DeadLetterOperationConflictError)
      await expect(store.get('retry-job-1')).resolves.toEqual({ fingerprint: fingerprint(), status: 'failed', failureCode: 'stale_revision' })
    }
    finally { sqlite.close() }
  })

  it('upgrades and preserves legacy reliability committed and pending receipts', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(readFileSync(new URL('../migrations/0009_reliability_dead_letter_operations_sqlite.sql', import.meta.url), 'utf8'))
      sqlite.prepare('insert into reliability_dead_letter_operations values (\'legacy-committed\', ?, \'reliability\', \'outbox\', \'message-1\', \'discard\', \'committed\', ?, ?, 42, \'discarded\', null)').run(fingerprint(), new Date(100).toISOString(), new Date(200).toISOString())
      sqlite.prepare('insert into reliability_dead_letter_operations (operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at) values (\'legacy-pending\', ?, \'reliability\', \'inbox\', \'message-2\', \'retry\', \'pending\', ?)').run(fingerprint('b'), new Date(100).toISOString())
      sqlite.exec(readFileSync(new URL('../migrations/0011_generalize_dead_letter_operations_sqlite.sql', import.meta.url), 'utf8'))
      const store = sqliteStore(sqlite)

      await expect(store.get('legacy-committed')).resolves.toEqual({ fingerprint: fingerprint(), status: 'committed', result: { key: { source: 'reliability', namespace: 'outbox', id: 'message-1' }, disposition: 'discarded', revision: '42', operationId: 'legacy-committed', committedAt: new Date(200).toISOString() } })
      await expect(store.get('legacy-pending')).resolves.toEqual({ fingerprint: fingerprint('b'), status: 'pending' })
    }
    finally { sqlite.close() }
  })

  it('emits parameterized PostgreSQL atomic reservation and terminal CAS', async () => {
    const dialect = new PgDialect()
    const execute = vi.fn((query: SQL) => {
      const compiled = dialect.sqlToQuery(query)
      expect(compiled.sql).not.toContain('retry-job-1')
      return { rows: [{ operation_id: 'retry-job-1' }] }
    })
    const store = new DrizzleDeadLetterOperationStore({ execute }, () => new Date(100))

    await expect(store.reserve('retry-job-1', fingerprint())).resolves.toBe('reserved')
    await expect(store.finalize('retry-job-1', fingerprint(), { status: 'committed', result: result() })).resolves.toBeUndefined()
    expect(dialect.sqlToQuery(execute.mock.calls[0]![0]).sql.toLowerCase()).toContain('on conflict (operation_id) do nothing returning operation_id')
    expect(dialect.sqlToQuery(execute.mock.calls[1]![0]).sql.toLowerCase()).toContain('where operation_id = $7 and fingerprint = $8 and status = \'pending\' returning operation_id')
  })
})
