import { describe, expect, it } from 'vitest'
import { Notification } from '@nuxt-laravelize/notifications/runtime'
import { DatabaseNotificationChannel, DatabaseNotificationIdempotencyConflictError, InMemoryDatabaseNotificationStore, InvalidDatabaseNotificationError, type NotificationJsonObject } from '../src/runtime/index'

class StoredNotification extends Notification {
  constructor(private readonly message = 'ready') { super() }
  via() { return ['database'] }
  databaseType() { return 'order.ready' }
  databaseVersion() { return 1 }
  toDatabase(): NotificationJsonObject { return { message: this.message } }
}

const recipient = (tenantId?: string) => ({ routeNotificationFor: () => ({ type: 'user', id: 'user-1', ...(tenantId ? { tenantId } : {}) }) })
const now = () => new Date('2026-01-02T03:04:05.000Z')

describe('database notification channel', () => {
  it('stores bounded content with trusted tenant, locale, and deterministic idempotency', async () => {
    const store = new InMemoryDatabaseNotificationStore()
    const channel = new DatabaseNotificationChannel(store, () => 'tenant-1', () => 'random-1', now, false)
    await channel.send(recipient('tenant-1'), new StoredNotification(), { locale: 'es', idempotencyKey: 'delivery-1' })
    await channel.send(recipient('tenant-1'), new StoredNotification(), { locale: 'es', idempotencyKey: 'delivery-1' })
    const page = await store.list({ recipient: { type: 'user', id: 'user-1', tenantId: 'tenant-1' } })
    expect(page.records).toHaveLength(1)
    expect(page.records[0]).toMatchObject({ type: 'order.ready', version: 1, data: { message: 'ready' }, locale: 'es', createdAt: '2026-01-02T03:04:05.000Z' })
    expect(page.records[0]!.id).toMatch(/^notify-/)
  })

  it('rejects idempotency reuse with different immutable content', async () => {
    const store = new InMemoryDatabaseNotificationStore()
    const channel = new DatabaseNotificationChannel(store, undefined, () => 'random-1', now, false)
    await channel.send(recipient(), new StoredNotification('first'), { idempotencyKey: 'delivery-1' })
    await expect(channel.send(recipient(), new StoredNotification('second'), { idempotencyKey: 'delivery-1' })).rejects.toBeInstanceOf(DatabaseNotificationIdempotencyConflictError)
  })

  it('fails closed for tenant spoofing, untrusted tenant routes, invalid content, aborts, and non-durable production stores', async () => {
    const store = new InMemoryDatabaseNotificationStore()
    await expect(new DatabaseNotificationChannel(store, () => 'tenant-2', undefined, now, false).send(recipient('tenant-1'), new StoredNotification())).rejects.toThrow(/tenant mismatch/)
    await expect(new DatabaseNotificationChannel(store, undefined, undefined, now, false).send(recipient('tenant-1'), new StoredNotification())).rejects.toThrow(/trusted execution context/)
    const invalid = new class extends StoredNotification {
      override toDatabase(): NotificationJsonObject { return { value: Number.NaN } }
    }()
    await expect(new DatabaseNotificationChannel(store, undefined, undefined, now, false).send(recipient(), invalid)).rejects.toThrow(/JSON-safe/)
    const controller = new AbortController()
    controller.abort()
    await expect(new DatabaseNotificationChannel(store, undefined, undefined, now, false).send(recipient(), new StoredNotification(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(new DatabaseNotificationChannel(store, undefined, undefined, now, true).send(recipient(), new StoredNotification())).rejects.toBeInstanceOf(InvalidDatabaseNotificationError)
  })
})

describe('in-memory database notification store', () => {
  it('isolates tenants, paginates equal timestamps, and manages read state', async () => {
    const store = new InMemoryDatabaseNotificationStore()
    const base = { type: 'order.ready', version: 1, data: { ok: true }, fingerprint: 'sha256:fingerprint', createdAt: '2026-01-02T03:04:05.000Z' }
    await store.put({ ...base, id: 'a', recipient: { type: 'user', id: '1', tenantId: 'one' } })
    await store.put({ ...base, id: 'b', recipient: { type: 'user', id: '1', tenantId: 'one' }, fingerprint: 'sha256:fingerprint-b' })
    await store.put({ ...base, id: 'c', recipient: { type: 'user', id: '1', tenantId: 'two' }, fingerprint: 'sha256:fingerprint-c' })
    const first = await store.list({ recipient: { type: 'user', id: '1', tenantId: 'one' }, limit: 1 })
    expect(first.records.map(record => record.id)).toEqual(['b'])
    expect(first.next).toEqual({ createdAt: base.createdAt, id: 'b' })
    const second = await store.list({ recipient: { type: 'user', id: '1', tenantId: 'one' }, before: first.next })
    expect(second.records.map(record => record.id)).toEqual(['a'])
    expect(await store.markRead({ type: 'user', id: '1', tenantId: 'two' }, 'a')).toBe(false)
    expect(await store.markRead({ type: 'user', id: '1', tenantId: 'one' }, 'a', '2026-01-03T00:00:00.000Z')).toBe(true)
    expect((await store.list({ recipient: { type: 'user', id: '1', tenantId: 'one' }, unreadOnly: true })).records.map(record => record.id)).toEqual(['b'])
    expect(await store.markUnread({ type: 'user', id: '1', tenantId: 'one' }, 'a')).toBe(true)
  })
})
