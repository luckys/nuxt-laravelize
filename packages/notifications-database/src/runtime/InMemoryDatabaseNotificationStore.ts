import { DatabaseNotificationIdempotencyConflictError, type DatabaseNotificationPage, type DatabaseNotificationQuery, type DatabaseNotificationRecipient, type DatabaseNotificationRecord, type DatabaseNotificationStore } from './contracts'
import { normalizeDatabaseNotificationId, normalizeDatabaseNotificationQuery, normalizeDatabaseNotificationRecipient, normalizeDatabaseNotificationRecord, normalizeReadAt } from './validation'

export class InMemoryDatabaseNotificationStore implements DatabaseNotificationStore {
  readonly durability = 'memory' as const
  readonly #records = new Map<string, DatabaseNotificationRecord>()

  constructor(private readonly capacity = 1_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new TypeError('Database notification memory capacity must be a positive integer')
  }

  async put(input: DatabaseNotificationRecord): Promise<'stored' | 'duplicate'> {
    const record = normalizeDatabaseNotificationRecord(input)
    const key = recordKey(record.recipient, record.id)
    const existing = this.#records.get(key)
    if (existing) {
      if (existing.fingerprint !== record.fingerprint) throw new DatabaseNotificationIdempotencyConflictError(record.id)
      return 'duplicate'
    }
    if (this.#records.size >= this.capacity) throw new Error('Database notification in-memory store capacity reached')
    this.#records.set(key, structuredClone(record))
    return 'stored'
  }

  async list(input: DatabaseNotificationQuery): Promise<DatabaseNotificationPage> {
    const query = normalizeDatabaseNotificationQuery(input)
    const values = [...this.#records.values()]
      .filter(record => sameRecipient(record.recipient, query.recipient) && (!query.unreadOnly || record.readAt === undefined))
      .filter(record => !query.before || record.createdAt < query.before.createdAt || (record.createdAt === query.before.createdAt && record.id < query.before.id))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    const records = values.slice(0, query.limit).map(record => structuredClone(record))
    const last = records.at(-1)
    return { records, ...(values.length > query.limit && last ? { next: { createdAt: last.createdAt, id: last.id } } : {}) }
  }

  async markRead(recipientInput: DatabaseNotificationRecipient, idInput: string, readAtInput?: string): Promise<boolean> {
    const recipient = normalizeDatabaseNotificationRecipient(recipientInput)
    const id = normalizeDatabaseNotificationId(idInput)
    const key = recordKey(recipient, id)
    const current = this.#records.get(key)
    if (!current) return false
    const readAt = normalizeReadAt(readAtInput)
    if (readAt < current.createdAt) throw new TypeError('Database notification readAt cannot precede createdAt')
    this.#records.set(key, { ...current, readAt })
    return true
  }

  async markUnread(recipientInput: DatabaseNotificationRecipient, idInput: string): Promise<boolean> {
    const recipient = normalizeDatabaseNotificationRecipient(recipientInput)
    const id = normalizeDatabaseNotificationId(idInput)
    const key = recordKey(recipient, id)
    const current = this.#records.get(key)
    if (!current) return false
    const { readAt: _readAt, ...unread } = current
    this.#records.set(key, unread)
    return true
  }
}

export class DisabledDatabaseNotificationStore implements DatabaseNotificationStore {
  readonly durability = 'disabled' as const
  async put(): Promise<'stored' | 'duplicate'> { throw new Error('Database notifications are disabled; configure a durable store or the explicit memory driver') }
  async list(): Promise<DatabaseNotificationPage> { throw new Error('Database notifications are disabled; configure a durable store or the explicit memory driver') }
  async markRead(): Promise<boolean> { throw new Error('Database notifications are disabled; configure a durable store or the explicit memory driver') }
  async markUnread(): Promise<boolean> { throw new Error('Database notifications are disabled; configure a durable store or the explicit memory driver') }
}

export function databaseNotificationTenantScope(recipient: DatabaseNotificationRecipient): string {
  return recipient.tenantId ?? ''
}

function recordKey(recipient: DatabaseNotificationRecipient, id: string): string {
  return JSON.stringify([databaseNotificationTenantScope(recipient), recipient.type, recipient.id, id])
}

function sameRecipient(left: DatabaseNotificationRecipient, right: DatabaseNotificationRecipient): boolean {
  return left.type === right.type && left.id === right.id && databaseNotificationTenantScope(left) === databaseNotificationTenantScope(right)
}
