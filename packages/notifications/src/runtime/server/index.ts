import { useContainer } from '@nuxt-laravelize/core/runtime/server'
import { notificationManagerToken } from '../tokens'

export function useNotifications(event: Parameters<typeof useContainer>[0]) {
  return useContainer(event).make(notificationManagerToken)
}
