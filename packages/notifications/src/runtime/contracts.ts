export type ChannelName = 'log' | 'mail' | (string & {})

export interface NotificationDeliveryContext {
  readonly locale?: string
  readonly idempotencyKey?: string
  readonly signal?: AbortSignal
}

export interface Notifiable {
  routeNotificationFor(channel: ChannelName, notification?: Notification): unknown
}

export abstract class Notification {
  abstract via(notifiable: Notifiable): readonly ChannelName[]
  toLog?(notifiable: Notifiable): string
  toArray?(notifiable: Notifiable): Record<string, unknown>
  toMail?(notifiable: Notifiable): unknown
}

export interface NotificationChannel {
  send(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void>
}
