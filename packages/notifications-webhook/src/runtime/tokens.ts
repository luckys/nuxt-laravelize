import { createToken } from '@nuxt-laravelize/core/runtime'
import type { OutboxStore } from '@nuxt-laravelize/reliability'
import type { WebhookNotificationEndpointResolver } from './contracts'

export const webhookNotificationEndpointResolverToken = createToken<WebhookNotificationEndpointResolver>('laravelize.notifications.webhook.endpoint-resolver')
export const webhookNotificationOutboxStoreToken = createToken<OutboxStore>('laravelize.notifications.webhook.outbox-store')
