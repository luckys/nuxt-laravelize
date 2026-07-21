import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sqliteIdempotencyRecords = sqliteTable('idempotency_records', {
  key: text('key').primaryKey(), fingerprint: text('fingerprint').notNull(), state: text('state').notNull(), leaseToken: text('lease_token').notNull(), leaseExpiresAt: integer('lease_expires_at').notNull(), expiresAt: integer('expires_at').notNull(), response: text('response'), acquisitionMarker: text('acquisition_marker').notNull(),
}, table => [check('idempotency_records_state_check', sql`${table.state} in ('processing', 'completed', 'failed')`), check('idempotency_records_lease_time_check', sql`${table.leaseExpiresAt} >= 0`), check('idempotency_records_expiry_check', sql`${table.expiresAt} >= 0`), check('idempotency_records_response_check', sql`(${table.state} = 'completed' and ${table.response} is not null and json_valid(${table.response})) or (${table.state} <> 'completed' and ${table.response} is null)`)])
