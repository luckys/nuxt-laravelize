import type { ChannelName, Notifiable, Notification, NotificationDeliveryContext } from './contracts'

export type NotificationDeliveryEventContext = Readonly<Pick<NotificationDeliveryContext, 'idempotencyKey' | 'locale' | 'occurredAt' | 'tenantId'>>

export class NotificationDelivered {
  readonly type = 'notification.delivered'
  declare readonly notifiable: Notifiable
  declare readonly notification: Notification

  constructor(
    notifiable: Notifiable,
    notification: Notification,
    readonly channel: ChannelName,
    readonly context: NotificationDeliveryEventContext,
  ) {
    Object.defineProperties(this, {
      notifiable: { value: notifiable, enumerable: false },
      notification: { value: notification, enumerable: false },
    })
  }
}

export class NotificationDeliveryFailed {
  readonly type = 'notification.delivery-failed'
  declare readonly notifiable: Notifiable
  declare readonly notification: Notification
  declare readonly error: unknown

  constructor(
    notifiable: Notifiable,
    notification: Notification,
    readonly channel: ChannelName,
    readonly context: NotificationDeliveryEventContext,
    error: unknown,
    readonly aborted: boolean,
  ) {
    Object.defineProperties(this, {
      notifiable: { value: notifiable, enumerable: false },
      notification: { value: notification, enumerable: false },
      error: { value: error, enumerable: false },
    })
  }
}
