import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { mailerToken } from '@nuxt-laravelize/mail/runtime'
import { notificationChannelRegistryToken } from '@nuxt-laravelize/notifications/runtime'
import { MailNotificationChannel } from '../MailNotificationChannel'

export default class NotificationsMailServiceProvider implements ServiceProvider {
  register(): void {}
  boot(container: Container): void {
    container.make(notificationChannelRegistryToken).register('mail', resolver => new MailNotificationChannel(resolver.make(mailerToken)))
  }
}
