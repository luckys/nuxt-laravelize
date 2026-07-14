import { createToken } from '@nuxt-laravelize/core/runtime'
import type { DefaultNotificationManager } from './NotificationManager'

export const notificationManagerToken = createToken<DefaultNotificationManager>('laravelize.notifications')
