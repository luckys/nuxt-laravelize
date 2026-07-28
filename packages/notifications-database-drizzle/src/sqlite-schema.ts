import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sqliteDatabaseNotifications = sqliteTable('database_notifications', {
  tenantScope: text('tenant_scope').notNull(),
  id: text('id').notNull(),
  tenantId: text('tenant_id'),
  recipientType: text('recipient_type').notNull(),
  recipientId: text('recipient_id').notNull(),
  notificationType: text('notification_type').notNull(),
  notificationVersion: integer('notification_version').notNull(),
  data: text('data').notNull(),
  fingerprint: text('fingerprint').notNull(),
  locale: text('locale'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
}, table => [
  primaryKey({ columns: [table.tenantScope, table.id] }),
  index('database_notifications_recipient_time_idx').on(table.tenantScope, table.recipientType, table.recipientId, table.createdAt, table.id),
  index('database_notifications_unread_idx').on(table.tenantScope, table.recipientType, table.recipientId, table.readAt, table.createdAt),
  check('database_notifications_tenant_scope_check', sql`((${table.tenantId} is null and ${table.tenantScope} = '') or (${table.tenantId} is not null and ${table.tenantScope} = ${table.tenantId}))`),
  check('database_notifications_version_check', sql`${table.notificationVersion} > 0`),
  check('database_notifications_data_check', sql`json_valid(${table.data}) and json_type(${table.data}) = 'object'`),
  check('database_notifications_read_time_check', sql`${table.readAt} is null or ${table.readAt} >= ${table.createdAt}`),
])
