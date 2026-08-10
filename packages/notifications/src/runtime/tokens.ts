import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { DefaultNotificationManager, NotificationChannelRegistry } from './NotificationManager'

export const notificationManagerToken = createToken<DefaultNotificationManager>('laravelize.notifications')
export const notificationChannelRegistryToken = createToken<NotificationChannelRegistry>('laravelize.notification-channels')
