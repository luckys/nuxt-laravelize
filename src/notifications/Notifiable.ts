export type ChannelName = 'mail' | 'log' | 'queue' | (string & {})

export interface Notifiable {
  routeNotificationFor(channel: ChannelName): string | null
}
