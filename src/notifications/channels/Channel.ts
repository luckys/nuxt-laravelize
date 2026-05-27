import type { Notifiable } from '../Notifiable'
import type { Notification } from '../Notification'

export interface Channel {
  send(notifiable: Notifiable, notification: Notification): Promise<void>
}
