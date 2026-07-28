import { createToken } from '@nuxt-laravelize/core/runtime'
import type { DatabaseNotificationStore } from './contracts'

export const databaseNotificationStoreToken = createToken<DatabaseNotificationStore>('laravelize.notifications.database.store')
