import type { ChannelName, Notifiable, Notification, NotificationChannel } from './contracts'

export class UnknownNotificationChannel extends Error {
  constructor(channel: string) {
    super(`No notification channel registered for "${channel}".`)
    this.name = 'UnknownNotificationChannel'
  }
}

export class DefaultNotificationManager {
  readonly #channels = new Map<string, NotificationChannel>()

  register(name: string, channel: NotificationChannel): void { this.#channels.set(name, channel) }

  async send(notifiable: Notifiable | readonly Notifiable[], notification: Notification): Promise<void> {
    const recipients = Array.isArray(notifiable) ? notifiable : [notifiable]
    for (const recipient of recipients) await this.sendNow(recipient, notification)
  }

  async sendNow(notifiable: Notifiable, notification: Notification): Promise<void> {
    for (const name of notification.via(notifiable)) {
      const channel = this.#channels.get(name)
      if (!channel) throw new UnknownNotificationChannel(name)
      await channel.send(notifiable, notification)
    }
  }

  route(channel: ChannelName, address: unknown): PendingNotification {
    return new PendingNotification(this).route(channel, address)
  }
}

export class PendingNotification {
  readonly #routes = new Map<ChannelName, unknown>()

  constructor(private readonly manager: DefaultNotificationManager) {}

  route(channel: ChannelName, address: unknown): this {
    this.#routes.set(channel, address)
    return this
  }

  notify(notification: Notification): Promise<void> {
    return this.manager.sendNow({ routeNotificationFor: channel => this.#routes.get(channel) }, notification)
  }
}
