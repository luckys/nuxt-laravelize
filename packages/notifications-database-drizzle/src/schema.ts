import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { NotificationJsonObject } from '@nuxt-laravelize/notifications-database/runtime'

export const databaseNotifications = pgTable('database_notifications', {
  tenantScope: text('tenant_scope').notNull(),
  id: text('id').notNull(),
  tenantId: text('tenant_id'),
  recipientType: text('recipient_type').notNull(),
  recipientId: text('recipient_id').notNull(),
  notificationType: text('notification_type').notNull(),
  notificationVersion: integer('notification_version').notNull(),
  data: jsonb('data').$type<NotificationJsonObject>().notNull(),
  fingerprint: text('fingerprint').notNull(),
  locale: text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, table => [
  primaryKey({ columns: [table.tenantScope, table.id] }),
  index('database_notifications_recipient_time_idx').on(table.tenantScope, table.recipientType, table.recipientId, table.createdAt, table.id),
  index('database_notifications_unread_idx').on(table.tenantScope, table.recipientType, table.recipientId, table.readAt, table.createdAt),
  check('database_notifications_tenant_scope_check', sql`((${table.tenantId} is null and ${table.tenantScope} = '') or (${table.tenantId} is not null and ${table.tenantScope} = ${table.tenantId}))`),
  check('database_notifications_version_check', sql`${table.notificationVersion} > 0`),
  check('database_notifications_data_check', sql`jsonb_typeof(${table.data}) = 'object'`),
  check('database_notifications_read_time_check', sql`${table.readAt} is null or ${table.readAt} >= ${table.createdAt}`),
])
