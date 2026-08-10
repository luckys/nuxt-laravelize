import type { JsonValue } from '@luckys_luis/nuxt-laravelize-reliability'

export type WebhookNotificationJsonObject = { readonly [key: string]: JsonValue }

export interface WebhookNotificationRoute {
  readonly endpointId: string
  readonly tenantId?: string
}

export interface WebhookNotificationEndpoint {
  readonly endpointId: string
  readonly tenantId?: string
  readonly url: string
  readonly secretId: string
}

export interface WebhookNotificationEndpointResolver {
  resolve(endpointId: string, context: { readonly tenantId?: string, readonly signal?: AbortSignal }): Promise<WebhookNotificationEndpoint | null>
}
