import type { ChannelName, Notifiable, Notification, NotificationChannel } from '../contracts'

interface SentNotification { readonly notifiable: Notifiable, readonly notification: Notification, readonly channels: readonly ChannelName[] }
type NotificationMatcher<T extends Notification> = (notification: T, channels: readonly ChannelName[]) => boolean

export class NotificationFake {
  readonly sent: SentNotification[] = []

  async send(notifiable: Notifiable | readonly Notifiable[], notification: Notification): Promise<void> {
    const recipients = Array.isArray(notifiable) ? notifiable : [notifiable]
    for (const recipient of recipients) {
      this.sent.push({ notifiable: recipient, notification, channels: Object.freeze([...new Set(notification.via(recipient))]) })
    }
  }

  sendNow(notifiable: Notifiable, notification: Notification): Promise<void> { return this.send(notifiable, notification) }

  register(_name: string, _channel: NotificationChannel): void {}

  reset(): void { this.sent.length = 0 }

  assertSentTo<T extends Notification>(notifiable: Notifiable, type: new (...args: never[]) => T, matcher?: NotificationMatcher<T>): void {
    if (this.matching(notifiable, type, matcher).length === 0) {
      throw new Error(`Expected ${type.name} to be sent to the notifiable.`)
    }
  }

  assertSentToTimes<T extends Notification>(notifiable: Notifiable, type: new (...args: never[]) => T, times: number): void {
    this.assertCountValue(times)
    const actual = this.matching(notifiable, type).length
    if (actual !== times) throw new Error(`Expected ${type.name} to be sent to the notifiable ${times} times, received ${actual}.`)
  }

  assertSentTimes<T extends Notification>(type: new (...args: never[]) => T, times: number): void {
    this.assertCountValue(times)
    const actual = this.sent.filter(entry => entry.notification instanceof type).length
    if (actual !== times) throw new Error(`Expected ${type.name} to be sent ${times} times, received ${actual}.`)
  }

  assertNotSentTo<T extends Notification>(notifiable: Notifiable, type: new (...args: never[]) => T, matcher?: NotificationMatcher<T>): void {
    if (this.matching(notifiable, type, matcher).length > 0) throw new Error(`Expected ${type.name} not to be sent to the notifiable.`)
  }

  assertCount(count: number): void {
    this.assertCountValue(count)
    if (this.sent.length !== count) throw new Error(`Expected ${count} notifications to be sent, received ${this.sent.length}.`)
  }

  assertNothingSent(): void { this.assertCount(0) }

  private matching<T extends Notification>(notifiable: Notifiable, type: new (...args: never[]) => T, matcher?: NotificationMatcher<T>): T[] {
    return this.sent
      .filter((entry): entry is SentNotification & { notification: T } => entry.notifiable === notifiable && entry.notification instanceof type)
      .filter(entry => !matcher || matcher(entry.notification, entry.channels))
      .map(entry => entry.notification)
  }

  private assertCountValue(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Expected notification count must be a non-negative safe integer')
  }
}
