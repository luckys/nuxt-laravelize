import { useRuntimeConfig } from '#imports'
import { ConsoleLogger, loggerToken, type Container, type ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { notificationChannelRegistryToken } from '@luckys_luis/nuxt-laravelize-notifications/runtime'
import { DatabaseNotificationChannel } from '../DatabaseNotificationChannel'
import { DisabledDatabaseNotificationStore, InMemoryDatabaseNotificationStore } from '../InMemoryDatabaseNotificationStore'
import { databaseNotificationStoreToken } from '../tokens'

export default class NotificationsDatabaseServiceProvider implements ServiceProvider {
  register(container: Container): void {
    const logger = () => container.has(loggerToken) ? container.make(loggerToken) : new ConsoleLogger({ threshold: 'warn' })
    if (!container.has(databaseNotificationStoreToken)) {
      const config = useRuntimeConfig().laravelizeNotificationsDatabase as { driver: 'memory' | 'null', memoryCapacity: number }
      if (config.driver === 'memory') {
        logger().warn('Database notifications use bounded volatile memory; records are lost on restart.', { capacity: config.memoryCapacity })
        container.singleton(databaseNotificationStoreToken, () => new InMemoryDatabaseNotificationStore(config.memoryCapacity))
      }
      else if (config.driver === 'null') container.singleton(databaseNotificationStoreToken, () => new DisabledDatabaseNotificationStore())
      else throw new TypeError(`Unsupported database notification driver: ${String(config.driver)}`)
    }
  }

  boot(container: Container): void {
    container.make(notificationChannelRegistryToken).register('database', resolver => new DatabaseNotificationChannel(
      resolver.make(databaseNotificationStoreToken),
      () => resolver.has(executionContextToken) ? resolver.make(executionContextToken).snapshot().tenantId : undefined,
    ))
  }
}
