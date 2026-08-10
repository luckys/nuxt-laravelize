import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { InboxStore } from '@luckys_luis/nuxt-laravelize-reliability'
import type { NotificationQueueRuntimeOptions } from './contracts'
import type { NotificationCodecRegistry, RecipientResolverRegistry } from './registries'
import type { QueuedNotificationDispatcher } from './QueuedNotificationDispatcher'

export const notificationCodecRegistryToken = createToken<NotificationCodecRegistry>('laravelize.notification-codecs')
export const recipientResolverRegistryToken = createToken<RecipientResolverRegistry>('laravelize.notification-recipients')
export const queuedNotificationDispatcherToken = createToken<QueuedNotificationDispatcher>('laravelize.queued-notifications')
export const notificationInboxStoreToken = createToken<InboxStore>('laravelize.notification-inbox')
export const notificationQueueOptionsToken = createToken<NotificationQueueRuntimeOptions>('laravelize.notification-queue-options')
