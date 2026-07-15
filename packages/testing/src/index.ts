import { createContainer, type Container } from '@nuxt-laravelize/core/runtime'
import { CacheFake } from '@nuxt-laravelize/cache/testing'
import { cacheToken } from '@nuxt-laravelize/cache/runtime'
import { EventFake } from '@nuxt-laravelize/events/testing'
import { dispatcherToken } from '@nuxt-laravelize/events/runtime'
import { FilesystemFake } from '@nuxt-laravelize/filesystem/testing'
import { FilesystemManager, filesystemManagerToken } from '@nuxt-laravelize/filesystem/runtime'
import { MailFake } from '@nuxt-laravelize/mail/testing'
import { mailerToken } from '@nuxt-laravelize/mail/runtime'
import { NotificationFake } from '@nuxt-laravelize/notifications/testing'
import { notificationManagerToken } from '@nuxt-laravelize/notifications/runtime'
import { QueueFake } from '@nuxt-laravelize/queue/testing'
import { queueToken } from '@nuxt-laravelize/queue/runtime'
import { RateLimiter, rateLimiterToken } from '@nuxt-laravelize/rate-limiter/runtime'

export { FakeLogger } from '@nuxt-laravelize/core/testing'
export { CacheFake } from '@nuxt-laravelize/cache/testing'
export { EventFake } from '@nuxt-laravelize/events/testing'
export { FilesystemFake } from '@nuxt-laravelize/filesystem/testing'
export { MailFake } from '@nuxt-laravelize/mail/testing'
export { NotificationFake } from '@nuxt-laravelize/notifications/testing'
export { QueueFake } from '@nuxt-laravelize/queue/testing'

export interface MountedLaravelize {
  readonly container: Container
  readonly cache: CacheFake
  readonly events: EventFake
  readonly filesystem: FilesystemFake
  readonly queue: QueueFake
  readonly mail: MailFake
  readonly notifications: NotificationFake
  readonly rateLimiter: RateLimiter
}

export function mountLaravelize(): MountedLaravelize {
  const container = createContainer()
  const cache = new CacheFake()
  const events = new EventFake()
  const filesystem = new FilesystemFake()
  const queue = new QueueFake()
  const mail = new MailFake()
  const notifications = new NotificationFake()
  const rateLimiter = new RateLimiter(cache)
  container.instance(dispatcherToken, events)
  container.instance(filesystemManagerToken, new FilesystemManager().register('default', filesystem))
  container.instance(cacheToken, cache)
  container.instance(queueToken, queue)
  container.instance(mailerToken, mail)
  container.instance(notificationManagerToken, notifications as never)
  container.instance(rateLimiterToken, rateLimiter)
  container.seal()
  return { container, cache, events, filesystem, queue, mail, notifications, rateLimiter }
}
