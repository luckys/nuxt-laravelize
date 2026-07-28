import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { DatabaseNotificationRecord } from '@nuxt-laravelize/notifications-database/runtime'
import { DrizzlePostgresDatabaseNotificationStore } from '../src/postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for the PostgreSQL integration test')

const schema = `notification_database_${process.pid}_${Date.now()}`
const client = postgres(databaseUrl, { max: 1 })
const database = drizzle(client)
const store = new DrizzlePostgresDatabaseNotificationStore(database)
const record: DatabaseNotificationRecord = { id: 'notification-1', recipient: { type: 'user', id: 'user-1', tenantId: 'tenant-1' }, type: 'order.ready', version: 1, data: { orderId: 'order-1' }, fingerprint: 'sha256:one', createdAt: '2026-01-02T03:04:05.000Z' }

describe('PostgreSQL database notification store', () => {
  beforeAll(async () => {
    await client.unsafe(`create schema "${schema}"`)
    await client.unsafe(`set search_path to "${schema}"`)
    await client.unsafe(await readFile(new URL('../migrations/0000_notifications_database_postgres.sql', import.meta.url), 'utf8'))
  })

  afterAll(async () => {
    await client.unsafe(`drop schema if exists "${schema}" cascade`)
    await client.end()
  })

  it('persists, isolates, paginates, and changes read state on real PostgreSQL', async () => {
    expect(await store.put(record)).toBe('stored')
    expect(await store.put(record)).toBe('duplicate')
    expect((await store.list({ recipient: record.recipient })).records).toEqual([record])
    expect((await store.list({ recipient: { ...record.recipient, tenantId: 'tenant-2' } })).records).toEqual([])
    expect(await store.markRead(record.recipient, record.id, '2026-01-03T00:00:00.000Z')).toBe(true)
    expect((await store.list({ recipient: record.recipient, unreadOnly: true })).records).toEqual([])
    expect(await store.markUnread(record.recipient, record.id)).toBe(true)
    expect((await store.list({ recipient: record.recipient, unreadOnly: true })).records).toHaveLength(1)
    await expect(client.unsafe(`insert into database_notifications (tenant_scope, id, tenant_id, recipient_type, recipient_id, notification_type, notification_version, data, fingerprint, created_at) values ('malformed', 'bad', null, 'user', 'user-1', 'test', 1, '{}'::jsonb, 'sha256:bad', now())`)).rejects.toThrow(/tenant_scope_check/)
  })
})
