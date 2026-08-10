import { DatabaseNotificationIdempotencyConflictError, databaseNotificationTenantScope, normalizeDatabaseNotificationId, normalizeDatabaseNotificationQuery, normalizeDatabaseNotificationRecipient, normalizeDatabaseNotificationRecord, normalizeReadAt, type DatabaseNotificationPage, type DatabaseNotificationQuery, type DatabaseNotificationRecipient, type DatabaseNotificationRecord } from '@luckys_luis/nuxt-laravelize-notifications-database/runtime'

export interface DrizzlePostgresDatabaseNotificationDatabase {
  execute(query: import('drizzle-orm').SQL): unknown | PromiseLike<unknown>
}

export interface DrizzleSQLiteDatabaseNotificationDatabase {
  all<T = unknown>(query: import('drizzle-orm').SQL): T[] | Promise<T[]>
}

export type Row = Record<string, unknown>

export function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[]
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: Row[] }).rows
  return []
}

export function persistedRecord(row: Row, sqlite: boolean): DatabaseNotificationRecord {
  const tenantId = row.tenant_id === null || row.tenant_id === undefined ? undefined : String(row.tenant_id)
  if (String(row.tenant_scope) !== (tenantId ?? '')) throw new TypeError('Invalid persisted database notification tenant scope')
  const locale = row.locale === null || row.locale === undefined ? undefined : String(row.locale)
  const readAt = row.read_at === null || row.read_at === undefined ? undefined : persistedTimestamp(row.read_at, sqlite)
  const rawData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
  return normalizeDatabaseNotificationRecord({
    id: String(row.id),
    recipient: { type: String(row.recipient_type), id: String(row.recipient_id), ...(tenantId ? { tenantId } : {}) },
    type: String(row.notification_type),
    version: Number(row.notification_version),
    data: rawData as DatabaseNotificationRecord['data'],
    fingerprint: String(row.fingerprint),
    ...(locale ? { locale } : {}),
    createdAt: persistedTimestamp(row.created_at, sqlite),
    ...(readAt ? { readAt } : {}),
  })
}

export function page(result: unknown, limit: number, sqlite: boolean): DatabaseNotificationPage {
  const values = rows(result).map(row => persistedRecord(row, sqlite))
  const hasMore = values.length > limit
  const records = values.slice(0, limit)
  const last = records.at(-1)
  return { records, ...(hasMore && last ? { next: { createdAt: last.createdAt, id: last.id } } : {}) }
}

export function query(input: DatabaseNotificationQuery) {
  return normalizeDatabaseNotificationQuery(input)
}
export function recipient(input: DatabaseNotificationRecipient) {
  return normalizeDatabaseNotificationRecipient(input)
}
export function notificationId(input: string) {
  return normalizeDatabaseNotificationId(input)
}
export function readAt(input?: string) {
  return normalizeReadAt(input)
}
export function tenantScope(input: DatabaseNotificationRecipient) {
  return databaseNotificationTenantScope(input)
}
export function record(input: DatabaseNotificationRecord) {
  return normalizeDatabaseNotificationRecord(input)
}

export function insertionResult(result: unknown, existing: unknown, value: DatabaseNotificationRecord): 'stored' | 'duplicate' {
  if (rows(result).length) return 'stored'
  const persisted = rows(existing)[0]
  if (!persisted || persisted.fingerprint !== value.fingerprint) throw new DatabaseNotificationIdempotencyConflictError(value.id)
  return 'duplicate'
}

function persistedTimestamp(value: unknown, sqlite: boolean): string {
  const timestamp = sqlite ? Number(value) : value instanceof Date ? value.getTime() : Date.parse(String(value))
  if (!Number.isFinite(timestamp)) throw new TypeError('Invalid persisted database notification timestamp')
  return new Date(timestamp as number).toISOString()
}
