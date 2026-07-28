import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { notificationChannelRegistryToken } from '@nuxt-laravelize/notifications/runtime'
import { webhookNotificationEndpointResolverToken, webhookNotificationOutboxStoreToken } from '../tokens'
import { WebhookNotificationChannel } from '../WebhookNotificationChannel'

export default class NotificationsWebhookServiceProvider implements ServiceProvider {
  register(): void {}
  boot(container: Container): void {
    container.make(notificationChannelRegistryToken).register('webhook', resolver => new WebhookNotificationChannel(
      resolver.make(webhookNotificationOutboxStoreToken),
      resolver.make(webhookNotificationEndpointResolverToken),
      () => resolver.has(executionContextToken) ? resolver.make(executionContextToken).snapshot().tenantId : undefined,
    ))
  }
}
