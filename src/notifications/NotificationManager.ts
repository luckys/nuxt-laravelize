import type { Channel } from './channels/Channel'
import type { Notifiable } from './Notifiable'
import type { Notification } from './Notification'

export interface NotificationManager {
  send(notifiable: Notifiable, notification: Notification): Promise<void>
  register(channel: string, implementation: Channel): void
}

export class DefaultNotificationManager implements NotificationManager {
  readonly #channels = new Map<string, Channel>()

  register(channel: string, implementation: Channel): void {
    this.#channels.set(channel, implementation)
  }

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const channels = notification.via(notifiable)
    for (const channelName of channels) {
      const channel = this.#channels.get(channelName)
      if (channel === undefined) {
        throw new UnknownNotificationChannel(channelName)
      }
      await channel.send(notifiable, notification)
    }
  }
}

export class UnknownNotificationChannel extends Error {
  constructor(channel: string) {
    super(`No channel registered for "${channel}"`)
    this.name = 'UnknownNotificationChannel'
  }
}
