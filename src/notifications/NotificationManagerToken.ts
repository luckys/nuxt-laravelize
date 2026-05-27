import { createToken } from '../core/container/Token'
import type { NotificationManager } from './NotificationManager'

export const notificationManagerToken = createToken<NotificationManager>('laravelize.notifications')
