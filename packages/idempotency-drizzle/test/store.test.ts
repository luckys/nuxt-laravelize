import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { DrizzlePostgresIdempotencyStore, DrizzleSQLiteIdempotencyStore, TursoIdempotencyStore } from '../src/index.js'

const postgresDialect = new PgDialect()
const sqliteDialect = new SQLiteSyncDialect()
const processing = (overrides: Record<string, unknown> = {}) => ({ key: 'danger\' --', fingerprint: 'fp', state: 'processing', lease_token: 'token', lease_expires_at: 110, expires_at: 110, response: null, acquisition_marker: 'old', ...overrides })

describe('Drizzle idempotency stores', () => {
  it('provides dedicated PostgreSQL, SQLite, and Turso adapters', () => {
    expect(new DrizzlePostgresIdempotencyStore({ execute: vi.fn() }).durability).toBe('durable')
    expect(new DrizzleSQLiteIdempotencyStore({ all: vi.fn() })).toBeInstanceOf(DrizzleSQLiteIdempotencyStore)
    expect(new TursoIdempotencyStore({ all: vi.fn() })).toBeInstanceOf(DrizzleSQLiteIdempotencyStore)
  })

  it('acquires with one parameterized UPSERT RETURNING and supports synchronous execute', async () => {
    const execute = vi.fn((query) => {
      const compiled = postgresDialect.sqlToQuery(query)
      const marker = compiled.params.find(value => typeof value === 'string' && value.includes('\u0000'))
      expect(compiled.sql.toLowerCase()).toContain('on conflict (key) do update')
      expect(compiled.sql.toLowerCase()).toContain(' returning ')
      expect(compiled.sql).not.toContain('danger\' --')
      return { rows: [processing({ acquisition_marker: marker })] }
    })
    const result = await new DrizzlePostgresIdempotencyStore({ execute }).acquire({ key: 'danger\' --', fingerprint: 'fp', leaseToken: 'token', now: 100, leaseMs: 10, retentionMs: 20 })
    expect(result.outcome).toBe('acquired')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('uses only SQLite all(SQL) and emits SQLite-compatible parameterized SQL', async () => {
    const all = vi.fn((query) => {
      const compiled = sqliteDialect.sqlToQuery(query)
      const marker = compiled.params.find(value => typeof value === 'string' && value.includes('\u0000'))
      expect(compiled.sql.toLowerCase()).toContain('on conflict (key) do update')
      expect(compiled.sql).not.toContain('danger\' --')
      return [processing({ acquisition_marker: marker })]
    })
    const database = { all }
    const result = await new DrizzleSQLiteIdempotencyStore(database).acquire({ key: 'danger\' --', fingerprint: 'fp', leaseToken: 'token', now: 100, leaseMs: 10, retentionMs: 20 })
    expect(result.outcome).toBe('acquired')
    expect(all).toHaveBeenCalledOnce()
    expect(database).not.toHaveProperty('execute')
  })

  it.each([
    [processing({ fingerprint: 'other' }), 'conflict'],
    [processing(), 'processing'],
    [processing({ state: 'failed' }), 'failed'],
    [processing({ state: 'completed', response: JSON.stringify({ version: 1, kind: 'json', status: 201, headers: {}, body: { ok: true } }) }), 'replay'],
  ])('maps retained rows to %s outcome', async (row, outcome) => {
    const store = new DrizzlePostgresIdempotencyStore({ execute: () => ({ rows: [row] }) })
    await expect(store.acquire({ key: 'danger\' --', fingerprint: 'fp', leaseToken: 'new', now: 100, leaseMs: 10, retentionMs: 20 })).resolves.toMatchObject({ outcome })
  })

  it('uses strict lease boundaries and RETURNING for every fenced mutation', async () => {
    const execute = vi.fn((query) => {
      const compiled = postgresDialect.sqlToQuery(query)
      expect(compiled.sql).toContain('lease_expires_at >')
      expect(compiled.sql.toLowerCase()).toContain(' returning ')
      return { rows: [] }
    })
    const store = new DrizzlePostgresIdempotencyStore({ execute })
    await expect(store.renew('key', 'stale', 100, 10)).resolves.toBe(false)
    await expect(store.fail('key', 'stale', 100, 10)).resolves.toBe(false)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('renders guarded mutations through SQLite and derives success from returned rows', async () => {
    const all = vi.fn((query) => {
      const compiled = sqliteDialect.sqlToQuery(query)
      expect(compiled.sql.toLowerCase()).toContain('update idempotency_records')
      expect(compiled.sql.toLowerCase()).toContain(' returning key')
      return [{ key: 'key' }]
    })
    const store = new DrizzleSQLiteIdempotencyStore({ all })
    await expect(store.renew('key', 'token', 100, 10)).resolves.toBe(true)
    await expect(store.fail('key', 'token', 100, 10)).resolves.toBe(true)
  })

  it('validates time arithmetic before IO', async () => {
    const execute = vi.fn()
    const store = new DrizzlePostgresIdempotencyStore({ execute })
    await expect(store.acquire({ key: 'k', fingerprint: 'f', leaseToken: 't', now: -1, leaseMs: 1, retentionMs: 1 })).rejects.toThrow(TypeError)
    await expect(store.renew('k', 't', Number.MAX_SAFE_INTEGER, 1)).rejects.toThrow(RangeError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('round-trips JSON and binary response envelopes and rejects corrupt persistence', async () => {
    const execute = vi.fn()
      .mockReturnValueOnce({ rows: [{ key: 'k', fingerprint: 'f', state: 'completed', lease_token: 't', lease_expires_at: 100, expires_at: 200, response: JSON.stringify({ version: 1, kind: 'response', status: 200, headers: { 'content-type': 'x' }, body: 'AA==' }), acquisition_marker: 'old' }] })
      .mockReturnValueOnce({ rows: [{ key: 'k', fingerprint: 'f', state: 'completed', lease_token: 't', lease_expires_at: 100, expires_at: 200, response: '{broken', acquisition_marker: 'old' }] })
    const store = new DrizzlePostgresIdempotencyStore({ execute })
    await expect(store.acquire({ key: 'k', fingerprint: 'f', leaseToken: 'new', now: 100, leaseMs: 1, retentionMs: 1 })).resolves.toMatchObject({ outcome: 'replay', record: { response: { body: 'AA==' } } })
    await expect(store.acquire({ key: 'k', fingerprint: 'f', leaseToken: 'new', now: 100, leaseMs: 1, retentionMs: 1 })).rejects.toThrow('Invalid persisted response envelope')
  })

  it('rejects malformed responses before completion IO', async () => {
    const execute = vi.fn()
    const store = new DrizzlePostgresIdempotencyStore({ execute })
    await expect(store.complete('k', 't', { kind: 'response', status: 200, headers: {}, body: 'not base64!' }, 1, 1)).rejects.toThrow('Invalid binary')
    await expect(store.complete('k', 't', { kind: 'json', status: 200, headers: {}, body: Number.NaN }, 1, 1)).rejects.toThrow('Invalid JSON')
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    { key: '', fingerprint: 'f', lease_token: 't', acquisition_marker: 'm' },
    { key: 'k', fingerprint: '', lease_token: 't', acquisition_marker: 'm' },
    { key: 'k', fingerprint: 'f', lease_token: '', acquisition_marker: 'm' },
    { key: 'k', fingerprint: 'f', lease_token: 't', acquisition_marker: '' },
  ])('fails closed for malformed identity columns: %o', async (identity) => {
    const row = processing(identity)
    const store = new DrizzlePostgresIdempotencyStore({ execute: () => ({ rows: [row] }) })
    await expect(store.acquire({ key: 'k', fingerprint: 'f', leaseToken: 'new', now: 100, leaseMs: 1, retentionMs: 1 })).rejects.toThrow(TypeError)
  })

  it('fails closed for malformed mutation RETURNING rows', async () => {
    const store = new DrizzleSQLiteIdempotencyStore({ all: () => [{ key: '' }] })
    await expect(store.renew('key', 'token', 100, 1)).rejects.toThrow(TypeError)
  })
})
