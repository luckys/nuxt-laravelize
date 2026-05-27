import type { Mailer } from '../../mail/Mailer'
import type { Notifiable } from '../Notifiable'
import type { Notification } from '../Notification'

import type { Channel } from './Channel'

export class MailChannel implements Channel {
  constructor(private readonly mailer: Mailer) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    if (notification.toMail === undefined) return
    const mailable = notification.toMail(notifiable)
    await this.mailer.send(mailable)
  }
}
