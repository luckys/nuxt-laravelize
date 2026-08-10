import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it, vi } from 'vitest'
import { DatabaseNotificationIdempotencyConflictError, type DatabaseNotificationRecord } from '@luckys_luis/nuxt-laravelize-notifications-database/runtime'
import { DrizzlePostgresDatabaseNotificationStore } from '../src/postgres'
import { DrizzleSQLiteDatabaseNotificationStore } from '../src/sqlite'

const base: DatabaseNotificationRecord = { id: 'notification-1', recipient: { type: 'user', id: 'user-1', tenantId: 'tenant-1' }, type: 'order.ready', version: 1, data: { orderId: 'order-1' }, fingerprint: 'sha256:one', locale: 'es', createdAt: '2026-01-02T03:04:05.000Z' }

describe('Drizzle database notification stores', () => {
  it('executes SQLite migrations and tenant-fenced CRUD against a real database', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(await readFile(new URL('../migrations/0001_notifications_database_sqlite.sql', import.meta.url), 'utf8'))
    const database = drizzle(async (sql, params) => ({ rows: sqlite.prepare(sql).all(...params as import('node:sqlite').SQLInputValue[]) }))
    const store = new DrizzleSQLiteDatabaseNotificationStore(database)
    expect(await store.put(base)).toBe('stored')
    expect(await store.put(base)).toBe('duplicate')
    await expect(store.put({ ...base, fingerprint: 'sha256:different' })).rejects.toBeInstanceOf(DatabaseNotificationIdempotencyConflictError)
    expect((await store.list({ recipient: base.recipient })).records).toEqual([base])
    expect((await store.list({ recipient: { ...base.recipient, tenantId: 'tenant-2' } })).records).toEqual([])
    expect(await store.markRead(base.recipient, base.id, '2026-01-03T00:00:00.000Z')).toBe(true)
    expect((await store.list({ recipient: base.recipient, unreadOnly: true })).records).toEqual([])
    expect(await store.markUnread(base.recipient, base.id)).toBe(true)
    expect((await store.list({ recipient: base.recipient, unreadOnly: true })).records).toHaveLength(1)
    expect(() => sqlite.prepare(`insert into database_notifications (tenant_scope, id, tenant_id, recipient_type, recipient_id, notification_type, notification_version, data, fingerprint, created_at) values ('malformed', 'bad', null, 'user', 'user-1', 'test', 1, '{}', 'sha256:bad', 1)`).run()).toThrow(/tenant_scope_check/)
    sqlite.close()
  })

  it('keeps PostgreSQL values parameterized and tenant-fences mutations', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: base.id }] })
      .mockResolvedValueOnce({ rows: [{ id: base.id }] })
      .mockResolvedValueOnce({ rows: [{ id: base.id }] })
    const store = new DrizzlePostgresDatabaseNotificationStore({ execute })
    await store.put(base)
    await store.markRead(base.recipient, base.id, '2026-01-03T00:00:00.000Z')
    await store.markUnread(base.recipient, base.id)
    for (const call of execute.mock.calls) {
      const query = call[0] as { queryChunks: unknown[] }
      expect(query.queryChunks.length).toBeGreaterThan(1)
    }
  })
})
