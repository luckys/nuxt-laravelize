import { ConsoleLogger, loggerToken, type Container, type ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { LogChannel } from '../LogChannel'
import { DefaultNotificationManager } from '../NotificationManager'
import { notificationManagerToken } from '../tokens'

export default class NotificationsServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(notificationManagerToken, (resolver) => {
      const manager = new DefaultNotificationManager()
      const logger = resolver.has(loggerToken)
        ? resolver.make(loggerToken)
        : new ConsoleLogger({ threshold: 'info' })
      manager.register('log', new LogChannel(logger))
      return manager
    })
  }
}
