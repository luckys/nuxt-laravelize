import type { JsonValue } from '@nuxt-laravelize/broadcasting/runtime'

export type BroadcastNotificationJsonObject = { [key: string]: JsonValue }

export interface BroadcastNotificationRecipient {
  readonly type: string
  readonly id: string
  readonly tenantId?: string
}
