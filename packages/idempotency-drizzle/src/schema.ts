import { bigint, check, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const idempotencyRecords = pgTable('idempotency_records', {
  key: text('key').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  state: text('state').notNull(),
  leaseToken: text('lease_token').notNull(),
  leaseExpiresAt: bigint('lease_expires_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  response: jsonb('response'),
  acquisitionMarker: text('acquisition_marker').notNull(),
}, table => [check('idempotency_records_state_check', sql`${table.state} in ('processing', 'completed', 'failed')`), check('idempotency_records_lease_time_check', sql`${table.leaseExpiresAt} >= 0`), check('idempotency_records_expiry_check', sql`${table.expiresAt} >= 0`), check('idempotency_records_response_check', sql`(${table.state} = 'completed' and ${table.response} is not null) or (${table.state} <> 'completed' and ${table.response} is null)`)])
