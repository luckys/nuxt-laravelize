import type { Mailable } from '../mail/Mailable'

import type { ChannelName, Notifiable } from './Notifiable'

export abstract class Notification {
  abstract via(notifiable: Notifiable): readonly ChannelName[]

  toMail?(notifiable: Notifiable): Mailable
  toLog?(notifiable: Notifiable): string
  toArray?(notifiable: Notifiable): Record<string, unknown>
}
