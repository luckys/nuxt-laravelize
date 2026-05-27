import type { Queue } from '../../queue/Queue'
import type { Notifiable } from '../Notifiable'
import type { Notification } from '../Notification'
import { SendNotificationJob } from '../jobs/SendNotificationJob'

import type { Channel } from './Channel'

export class QueueChannel implements Channel {
  constructor(private readonly queue: Queue) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const inlineChannels = notification.via(notifiable).filter((c) => c !== 'queue')
    const payload = notification.toArray?.(notifiable) ?? {}
    const job = new SendNotificationJob({
      notifiableType: (notifiable as object).constructor.name,
      notifiableId: notifiable.routeNotificationFor('queue'),
      notificationName: notification.constructor.name,
      args: [payload],
      channels: inlineChannels,
    })
    await this.queue.push(job)
  }
}
