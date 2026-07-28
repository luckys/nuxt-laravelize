import type { Notifiable, Notification, NotificationChannel, NotificationDeliveryContext } from '@nuxt-laravelize/notifications/runtime'
import type { DatabaseNotificationRecipient, DatabaseNotificationStore, NotificationJsonObject } from './contracts'
import { normalizeDatabaseNotificationData, normalizeDatabaseNotificationRecipient, normalizeDatabaseNotificationVersion, safeDatabaseNotificationText } from './validation'

interface StorableNotification extends Notification {
  databaseType(): string
  databaseVersion(): number
  toDatabase(notifiable: Notifiable, context?: NotificationDeliveryContext): NotificationJsonObject | Promise<NotificationJsonObject>
}

export class InvalidDatabaseNotificationError extends TypeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidDatabaseNotificationError'
  }
}

export class DatabaseNotificationChannel implements NotificationChannel {
  constructor(
    private readonly store: DatabaseNotificationStore,
    private readonly currentTenant?: () => string | undefined,
    private readonly idFactory: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
    private readonly requireDurable = process.env.NODE_ENV === 'production',
  ) {}

  async send(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    context?.signal?.throwIfAborted()
    if (this.requireDurable && this.store.durability !== 'durable') throw new InvalidDatabaseNotificationError('A durable database notification store is required in production')
    if (!isStorableNotification(notification)) throw new InvalidDatabaseNotificationError('Database notifications require databaseType(), databaseVersion(), and toDatabase()')
    let recipient: DatabaseNotificationRecipient
    try {
      recipient = normalizeDatabaseNotificationRecipient(notifiable.routeNotificationFor('database', notification))
    }
    catch (error) { throw new InvalidDatabaseNotificationError('Invalid database notification recipient', { cause: error }) }
    const trustedTenant = context?.tenantId ?? this.currentTenant?.()
    if (trustedTenant !== undefined) safeDatabaseNotificationText(trustedTenant, 'tenant id')
    if (recipient.tenantId !== undefined && trustedTenant === undefined) throw new InvalidDatabaseNotificationError('Database notification tenant requires trusted execution context')
    if (trustedTenant !== undefined && recipient.tenantId !== undefined && trustedTenant !== recipient.tenantId) throw new InvalidDatabaseNotificationError('Database notification tenant mismatch')
    recipient = { ...recipient, ...(trustedTenant ? { tenantId: trustedTenant } : {}) }
    const type = safeDatabaseNotificationText(notification.databaseType(), 'type')
    const version = normalizeDatabaseNotificationVersion(notification.databaseVersion())
    const data = normalizeDatabaseNotificationData(await notification.toDatabase(notifiable, context))
    context?.signal?.throwIfAborted()
    const id = context?.idempotencyKey
      ? await deterministicRecordId(context.idempotencyKey, recipient)
      : safeDatabaseNotificationText(this.idFactory(), 'id')
    const fingerprint = await notificationFingerprint(recipient, type, version, data, context?.locale)
    await this.store.put({ id, recipient, type, version, data, fingerprint, ...(context?.locale ? { locale: context.locale } : {}), createdAt: this.now().toISOString() })
  }
}

function isStorableNotification(notification: Notification): notification is StorableNotification {
  const candidate = notification as Partial<StorableNotification>
  return typeof candidate.databaseType === 'function' && typeof candidate.databaseVersion === 'function' && typeof candidate.toDatabase === 'function'
}

async function notificationFingerprint(recipient: DatabaseNotificationRecipient, type: string, version: number, data: NotificationJsonObject, locale?: string): Promise<string> {
  const value = canonicalize({ recipient, type, version, data, locale: locale ?? null })
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return `sha256:${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

async function deterministicRecordId(idempotencyKey: string, recipient: DatabaseNotificationRecipient): Promise<string> {
  safeDatabaseNotificationText(idempotencyKey, 'idempotency key')
  const value = JSON.stringify([recipient.tenantId ?? '', recipient.type, recipient.id, idempotencyKey])
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return `notify-${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}
