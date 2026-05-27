import type { H3Event } from 'h3'

import type { NotificationManager } from '../../../notifications/NotificationManager'
import { notificationManagerToken } from '../../../notifications/NotificationManagerToken'
import { useContainer } from '../utils/useContainer'

export function useNotifier(event: H3Event): NotificationManager {
  const container = useContainer(event)
  return container.make(notificationManagerToken)
}

export { Notification } from '../../../notifications/Notification'
export { notificationManagerToken } from '../../../notifications/NotificationManagerToken'
export type { Notifiable, ChannelName, NotificationManager } from '../../../notifications/index'
