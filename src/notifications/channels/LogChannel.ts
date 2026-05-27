import type { Logger } from '../../logging/Logger'
import type { Notifiable } from '../Notifiable'
import type { Notification } from '../Notification'

import type { Channel } from './Channel'

export class LogChannel implements Channel {
  constructor(private readonly logger: Logger) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const message = notification.toLog?.(notifiable) ?? notification.constructor.name
    this.logger.info('notification dispatched', {
      channel: 'log',
      notification: notification.constructor.name,
      message,
      payload: notification.toArray?.(notifiable),
    })
  }
}
