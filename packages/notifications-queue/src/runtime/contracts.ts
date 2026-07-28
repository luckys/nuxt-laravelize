import type { Notifiable, Notification } from '@nuxt-laravelize/notifications/runtime'
import type { InboxStore, JsonValue } from '@nuxt-laravelize/reliability'

export interface NotificationCodec<T extends Notification = Notification> {
  readonly type: string
  readonly version: number
  supports(notification: Notification): notification is T
  encode(notification: T): JsonValue
  decode(payload: JsonValue): T
}

export interface ResolvedRecipient {
  readonly notifiable: Notifiable
  readonly tenantId?: string
  readonly locale?: string
  readonly channels?: readonly string[]
}

export interface RecipientResolver<T extends Notifiable = Notifiable> {
  readonly type: string
  readonly version: number
  supports(notifiable: Notifiable): notifiable is T
  reference(notifiable: T): string
  resolve(id: string): Promise<ResolvedRecipient | null>
}

export interface QueuedNotificationOptions {
  readonly dispatchId?: string
}

export interface NotificationQueueRuntimeOptions {
  readonly inboxOwner?: string
  readonly requireDurableInbox?: boolean
  readonly signal?: AbortSignal
}

export type NotificationInboxStore = InboxStore
