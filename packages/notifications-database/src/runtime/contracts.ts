export type NotificationJsonPrimitive = string | number | boolean | null
export type NotificationJsonValue = NotificationJsonPrimitive | readonly NotificationJsonValue[] | { readonly [key: string]: NotificationJsonValue }
export type NotificationJsonObject = { readonly [key: string]: NotificationJsonValue }

export interface DatabaseNotificationRecipient {
  readonly type: string
  readonly id: string
  readonly tenantId?: string
}

export interface DatabaseNotificationRecord {
  readonly id: string
  readonly recipient: DatabaseNotificationRecipient
  readonly type: string
  readonly version: number
  readonly data: NotificationJsonObject
  readonly fingerprint: string
  readonly locale?: string
  readonly createdAt: string
  readonly readAt?: string
}

export interface DatabaseNotificationCursor {
  readonly createdAt: string
  readonly id: string
}

export interface DatabaseNotificationQuery {
  readonly recipient: DatabaseNotificationRecipient
  readonly unreadOnly?: boolean
  readonly limit?: number
  readonly before?: DatabaseNotificationCursor
}

export interface DatabaseNotificationPage {
  readonly records: readonly DatabaseNotificationRecord[]
  readonly next?: DatabaseNotificationCursor
}

export interface DatabaseNotificationStore {
  readonly durability: 'memory' | 'durable' | 'disabled'
  put(record: DatabaseNotificationRecord): Promise<'stored' | 'duplicate'>
  list(query: DatabaseNotificationQuery): Promise<DatabaseNotificationPage>
  markRead(recipient: DatabaseNotificationRecipient, id: string, readAt?: string): Promise<boolean>
  markUnread(recipient: DatabaseNotificationRecipient, id: string): Promise<boolean>
}

export class DatabaseNotificationIdempotencyConflictError extends Error {
  constructor(readonly notificationId: string) {
    super(`Database notification idempotency conflict: ${notificationId}`)
    this.name = 'DatabaseNotificationIdempotencyConflictError'
  }
}
