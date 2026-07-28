import type { DatabaseNotificationCursor, DatabaseNotificationQuery, DatabaseNotificationRecipient, DatabaseNotificationRecord, NotificationJsonObject, NotificationJsonValue } from './contracts'

const SAFE = /^[A-Z0-9][\w.:-]{0,127}$/i
const LOCALE = /^[A-Z]{2,8}(?:-[A-Z0-9]{1,8}){0,3}$/i
const encoder = new TextEncoder()
const LIMITS = { bytes: 262_144, depth: 32, nodes: 10_000, keys: 1_000, array: 10_000, string: 65_536 } as const

export function safeDatabaseNotificationText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE.test(value)) throw new TypeError(`Invalid database notification ${field}`)
  return value
}

export function canonicalNotificationTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`Invalid database notification ${field}`)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) throw new TypeError(`Invalid database notification ${field}`)
  return value
}

export function normalizeDatabaseNotificationRecipient(value: unknown): DatabaseNotificationRecipient {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Database notification recipient must be a plain object')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => key !== 'type' && key !== 'id' && key !== 'tenantId')) throw new TypeError('Invalid database notification recipient key')
  const type = safeDatabaseNotificationText(input.type, 'recipient type')
  const id = safeDatabaseNotificationText(input.id, 'recipient id')
  const tenantId = input.tenantId === undefined ? undefined : safeDatabaseNotificationText(input.tenantId, 'tenant id')
  return Object.freeze({ type, id, ...(tenantId ? { tenantId } : {}) })
}

export function normalizeDatabaseNotificationData(value: unknown): NotificationJsonObject {
  if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Database notification data must be a plain JSON object')
  assertJson(value)
  return structuredClone(value as NotificationJsonObject)
}

export function normalizeDatabaseNotificationRecord(value: DatabaseNotificationRecord): DatabaseNotificationRecord {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Database notification record must be a plain object')
  const id = safeDatabaseNotificationText(value.id, 'id')
  const recipient = normalizeDatabaseNotificationRecipient(value.recipient)
  const type = safeDatabaseNotificationText(value.type, 'type')
  const version = normalizeDatabaseNotificationVersion(value.version)
  const data = normalizeDatabaseNotificationData(value.data)
  const fingerprint = safeDatabaseNotificationText(value.fingerprint, 'fingerprint')
  const createdAt = canonicalNotificationTimestamp(value.createdAt, 'createdAt')
  const readAt = value.readAt === undefined ? undefined : canonicalNotificationTimestamp(value.readAt, 'readAt')
  if (readAt && readAt < createdAt) throw new TypeError('Database notification readAt cannot precede createdAt')
  const locale = value.locale === undefined ? undefined : value.locale
  if (locale !== undefined && (typeof locale !== 'string' || locale.length > 64 || !LOCALE.test(locale))) throw new TypeError('Invalid database notification locale')
  return Object.freeze({ id, recipient, type, version, data, fingerprint, ...(locale ? { locale } : {}), createdAt, ...(readAt ? { readAt } : {}) })
}

export function normalizeDatabaseNotificationVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) throw new TypeError('Invalid database notification version')
  return value as number
}

export function normalizeDatabaseNotificationQuery(value: DatabaseNotificationQuery): Required<Pick<DatabaseNotificationQuery, 'recipient' | 'unreadOnly' | 'limit'>> & Pick<DatabaseNotificationQuery, 'before'> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Database notification query must be a plain object')
  const limit = value.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Database notification query limit must be between 1 and 100')
  const before = value.before === undefined ? undefined : normalizeCursor(value.before)
  return { recipient: normalizeDatabaseNotificationRecipient(value.recipient), unreadOnly: value.unreadOnly ?? false, limit, ...(before ? { before } : {}) }
}

export function normalizeDatabaseNotificationId(value: unknown): string {
  return safeDatabaseNotificationText(value, 'id')
}

export function normalizeReadAt(value: string | undefined): string {
  return value === undefined ? new Date().toISOString() : canonicalNotificationTimestamp(value, 'readAt')
}

function normalizeCursor(value: DatabaseNotificationCursor): DatabaseNotificationCursor {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => key !== 'createdAt' && key !== 'id')) throw new TypeError('Invalid database notification cursor')
  return Object.freeze({ createdAt: canonicalNotificationTimestamp(value.createdAt, 'cursor createdAt'), id: safeDatabaseNotificationText(value.id, 'cursor id') })
}

function assertJson(value: unknown): asserts value is NotificationJsonValue {
  const stack: Array<{ value?: unknown, depth: number, exit?: object }> = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let bytes = 0
  let nodes = 0
  while (stack.length) {
    const current = stack.pop()!
    if (current.exit) {
      seen.delete(current.exit)
      continue
    }
    if (++nodes > LIMITS.nodes || current.depth > LIMITS.depth) throw new TypeError('Database notification data exceeds JSON structural limits')
    const item = current.value
    if (item === null || typeof item === 'boolean') continue
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Database notification data must be JSON-safe')
      continue
    }
    if (typeof item === 'string') {
      if (item.length > LIMITS.string) throw new TypeError('Database notification JSON string is too large')
      bytes += encoder.encode(item).byteLength
      if (bytes > LIMITS.bytes) throw new TypeError('Database notification data is too large')
      continue
    }
    if (!item || typeof item !== 'object' || seen.has(item)) throw new TypeError('Database notification data must be JSON-safe')
    seen.add(item)
    stack.push({ depth: current.depth, exit: item })
    if (Array.isArray(item)) {
      if (item.length > LIMITS.array) throw new TypeError('Database notification JSON array is too large')
      for (const child of item) stack.push({ value: child, depth: current.depth + 1 })
      continue
    }
    if (Object.getPrototypeOf(item) !== Object.prototype) throw new TypeError('Database notification data must be JSON-safe')
    const entries = Object.entries(item)
    if (entries.length > LIMITS.keys) throw new TypeError('Database notification JSON object has too many keys')
    for (const [key, child] of entries) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new TypeError('Database notification data has a reserved key')
      bytes += encoder.encode(key).byteLength
      stack.push({ value: child, depth: current.depth + 1 })
    }
    if (bytes > LIMITS.bytes) throw new TypeError('Database notification data is too large')
  }
}
