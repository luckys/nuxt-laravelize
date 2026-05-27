import type { Channel } from '../../../notifications/channels/Channel'
import type { NotificationManager } from '../../../notifications/NotificationManager'
import type { Notifiable } from '../../../notifications/Notifiable'
import type { Notification } from '../../../notifications/Notification'

interface SentEntry {
  readonly notifiable: Notifiable
  readonly notification: Notification
}

export class FakeNotificationManager implements NotificationManager {
  readonly sent: SentEntry[] = []

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    this.sent.push({ notifiable, notification })
  }

  register(_channel: string, _impl: Channel): void {}

  reset(): void { this.sent.length = 0 }

  assertSent<N extends Notification>(
    notificationClass: new (...args: never[]) => N,
    matcher?: (entry: { notifiable: Notifiable; notification: N }) => boolean,
  ): void {
    const matches = this.sent.filter((e) => e.notification instanceof notificationClass) as Array<{
      notifiable: Notifiable
      notification: N
    }>
    if (matches.length === 0) {
      throw new Error(`Expected a notification of type ${notificationClass.name} to be sent, none were.`)
    }
    if (matcher !== undefined && !matches.some(matcher)) {
      throw new Error(`Sent ${notificationClass.name} notifications did not match the predicate.`)
    }
  }

  assertSentTo<N extends Notification>(
    target: Notifiable,
    notificationClass: new (...args: never[]) => N,
  ): void {
    const matched = this.sent.find((e) => e.notifiable === target && e.notification instanceof notificationClass)
    if (matched === undefined) {
      throw new Error(`Expected a ${notificationClass.name} sent to the given notifiable.`)
    }
  }

  assertNothingSent(): void {
    if (this.sent.length > 0) {
      throw new Error(`Expected no notifications sent, but got ${this.sent.length}.`)
    }
  }
}
