import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { OutboxStore } from '@luckys_luis/nuxt-laravelize-reliability'
import type { WebhookNotificationEndpointResolver } from './contracts'

export const webhookNotificationEndpointResolverToken = createToken<WebhookNotificationEndpointResolver>('laravelize.notifications.webhook.endpoint-resolver')
export const webhookNotificationOutboxStoreToken = createToken<OutboxStore>('laravelize.notifications.webhook.outbox-store')
