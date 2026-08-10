import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'
import type { H3Event } from 'h3'
import { databaseNotificationStoreToken } from '../tokens'

export function useDatabaseNotifications(event: H3Event) {
  return useContainer(event).make(databaseNotificationStoreToken)
}
