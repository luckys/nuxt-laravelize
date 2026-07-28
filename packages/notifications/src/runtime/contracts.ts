export type ChannelName = 'log' | 'mail' | (string & {})

export type NotificationChannelDelays = Readonly<Partial<Record<ChannelName, number>>>

export interface NotificationDeliveryContext {
  readonly locale?: string
  readonly tenantId?: string
  readonly idempotencyKey?: string
  readonly occurredAt?: string
  readonly signal?: AbortSignal
}

export interface Notifiable {
  routeNotificationFor(channel: ChannelName, notification?: Notification): unknown
}

export abstract class Notification {
  abstract via(notifiable: Notifiable): readonly ChannelName[]
  withDelay?(notifiable: Notifiable): NotificationChannelDelays
  toLog?(notifiable: Notifiable): string
  toArray?(notifiable: Notifiable): Record<string, unknown>
  toMail?(notifiable: Notifiable): unknown
}

export interface NotificationChannel {
  send(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void>
}
