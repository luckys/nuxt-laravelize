import type { JsonValue } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

export type BroadcastNotificationJsonObject = { [key: string]: JsonValue }

export interface BroadcastNotificationRecipient {
  readonly type: string
  readonly id: string
  readonly tenantId?: string
}
