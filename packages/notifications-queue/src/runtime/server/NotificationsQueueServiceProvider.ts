import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { jobRegistryToken, queueToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { QueuedNotificationDispatcher } from '../QueuedNotificationDispatcher'
import { QueuedNotificationJob } from '../QueuedNotificationJob'
import { NotificationCodecRegistry, RecipientResolverRegistry } from '../registries'
import { notificationCodecRegistryToken, queuedNotificationDispatcherToken, recipientResolverRegistryToken } from '../tokens'

export default class NotificationsQueueServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(notificationCodecRegistryToken, () => new NotificationCodecRegistry())
    container.singleton(recipientResolverRegistryToken, () => new RecipientResolverRegistry())
    container.scoped(queuedNotificationDispatcherToken, resolver => new QueuedNotificationDispatcher(
      resolver.make(queueToken), resolver.make(notificationCodecRegistryToken), resolver.make(recipientResolverRegistryToken),
      () => resolver.has(executionContextToken) ? resolver.make(executionContextToken) : undefined,
    ))
  }

  boot(container: Container): void {
    container.make(jobRegistryToken).register(QueuedNotificationJob.jobName, QueuedNotificationJob)
  }
}
