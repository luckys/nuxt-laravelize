import { ConsoleLogger, loggerToken, type Container, type ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { dispatcherToken } from '@luckys_luis/nuxt-laravelize-events/runtime'
import { LogChannel } from '../LogChannel'
import { DefaultNotificationManager, NotificationChannelRegistry } from '../NotificationManager'
import { notificationChannelRegistryToken, notificationManagerToken } from '../tokens'

export default class NotificationsServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(notificationChannelRegistryToken, () => {
      const channels = new NotificationChannelRegistry()
      channels.register('log', resolver => new LogChannel(
        resolver.has(loggerToken) ? resolver.make(loggerToken) : new ConsoleLogger({ threshold: 'info' }),
      ))
      return channels
    })
    container.scoped(notificationManagerToken, (resolver) => {
      return new DefaultNotificationManager(resolver.make(notificationChannelRegistryToken), resolver, {
        ...(resolver.has(dispatcherToken) ? { dispatcher: resolver.make(dispatcherToken) } : {}),
        logger: resolver.has(loggerToken) ? resolver.make(loggerToken) : new ConsoleLogger({ threshold: 'warn' }),
      })
    })
  }
}
