import type { Logger } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Notifiable, Notification, NotificationChannel } from './contracts'

export class LogChannel implements NotificationChannel {
  constructor(private readonly logger: Logger) {}
  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    this.logger.info('notification dispatched', {
      channel: 'log',
      notification: notification.constructor.name,
      message: notification.toLog?.(notifiable) ?? notification.constructor.name,
      payload: notification.toArray?.(notifiable),
    })
  }
}
