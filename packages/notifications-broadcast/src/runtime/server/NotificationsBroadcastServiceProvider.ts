import { broadcastingManagerToken } from '@nuxt-laravelize/broadcasting/runtime'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { notificationChannelRegistryToken } from '@nuxt-laravelize/notifications/runtime'
import { BroadcastNotificationChannel } from '../BroadcastNotificationChannel'

export default class NotificationsBroadcastServiceProvider implements ServiceProvider {
  register(): void {}
  boot(container: Container): void {
    container.make(notificationChannelRegistryToken).register('broadcast', resolver => new BroadcastNotificationChannel(
      resolver.make(broadcastingManagerToken),
      () => resolver.has(executionContextToken) ? resolver.make(executionContextToken).snapshot().tenantId : undefined,
    ))
  }
}
