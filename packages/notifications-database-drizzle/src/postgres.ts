import { sql } from 'drizzle-orm'
import type { DatabaseNotificationQuery, DatabaseNotificationRecipient, DatabaseNotificationRecord, DatabaseNotificationStore } from '@luckys_luis/nuxt-laravelize-notifications-database/runtime'
import { insertionResult, notificationId, page, query, readAt, recipient, record, rows, tenantScope, type DrizzlePostgresDatabaseNotificationDatabase } from './shared'

export { databaseNotifications } from './schema'
export type { DrizzlePostgresDatabaseNotificationDatabase } from './shared'

export class DrizzlePostgresDatabaseNotificationStore implements DatabaseNotificationStore {
  readonly durability = 'durable' as const
  constructor(private readonly database: DrizzlePostgresDatabaseNotificationDatabase) {}

  async put(input: DatabaseNotificationRecord): Promise<'stored' | 'duplicate'> {
    const value = record(input)
    const scope = tenantScope(value.recipient)
    const inserted = await this.database.execute(sql`insert into database_notifications (tenant_scope, id, tenant_id, recipient_type, recipient_id, notification_type, notification_version, data, fingerprint, locale, created_at, read_at) values (${scope}, ${value.id}, ${value.recipient.tenantId ?? null}, ${value.recipient.type}, ${value.recipient.id}, ${value.type}, ${value.version}, ${JSON.stringify(value.data)}::jsonb, ${value.fingerprint}, ${value.locale ?? null}, ${value.createdAt}::timestamptz, ${value.readAt ?? null}::timestamptz) on conflict (tenant_scope, id) do nothing returning id`)
    if (rows(inserted).length) return 'stored'
    const existing = await this.database.execute(sql`select fingerprint from database_notifications where tenant_scope = ${scope} and id = ${value.id} limit 1`)
    return insertionResult(inserted, existing, value)
  }

  async list(input: DatabaseNotificationQuery) {
    const value = query(input)
    const scope = tenantScope(value.recipient)
    const unread = value.unreadOnly ? sql`and read_at is null` : sql``
    const cursor = value.before ? sql`and (created_at, id) < (${value.before.createdAt}::timestamptz, ${value.before.id})` : sql``
    const result = await this.database.execute(sql`select tenant_scope, id, tenant_id, recipient_type, recipient_id, notification_type, notification_version, data, fingerprint, locale, created_at, read_at from database_notifications where tenant_scope = ${scope} and recipient_type = ${value.recipient.type} and recipient_id = ${value.recipient.id} ${unread} ${cursor} order by created_at desc, id desc limit ${value.limit + 1}`)
    return page(result, value.limit, false)
  }

  async markRead(recipientInput: DatabaseNotificationRecipient, id: string, readAtInput?: string): Promise<boolean> {
    const value = recipient(recipientInput)
    const result = await this.database.execute(sql`update database_notifications set read_at = ${readAt(readAtInput)}::timestamptz where tenant_scope = ${tenantScope(value)} and recipient_type = ${value.type} and recipient_id = ${value.id} and id = ${notificationId(id)} returning id`)
    return rows(result).length > 0
  }

  async markUnread(recipientInput: DatabaseNotificationRecipient, id: string): Promise<boolean> {
    const value = recipient(recipientInput)
    const result = await this.database.execute(sql`update database_notifications set read_at = null where tenant_scope = ${tenantScope(value)} and recipient_type = ${value.type} and recipient_id = ${value.id} and id = ${notificationId(id)} returning id`)
    return rows(result).length > 0
  }
}
