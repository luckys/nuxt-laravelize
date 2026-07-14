import type { Notifiable, Notification, NotificationChannel } from '../contracts'

interface SentNotification { readonly notifiable: Notifiable, readonly notification: Notification }

export class NotificationFake {
  readonly sent: SentNotification[] = []

  async send(notifiable: Notifiable | readonly Notifiable[], notification: Notification): Promise<void> {
    const recipients = Array.isArray(notifiable) ? notifiable : [notifiable]
    for (const recipient of recipients) this.sent.push({ notifiable: recipient, notification })
  }

  sendNow(notifiable: Notifiable, notification: Notification): Promise<void> { return this.send(notifiable, notification) }

  register(_name: string, _channel: NotificationChannel): void {}

  assertSentTo<T extends Notification>(notifiable: Notifiable, type: new (...args: never[]) => T): void {
    if (!this.sent.some(entry => entry.notifiable === notifiable && entry.notification instanceof type)) {
      throw new Error(`Expected ${type.name} to be sent to the notifiable.`)
    }
  }
}
