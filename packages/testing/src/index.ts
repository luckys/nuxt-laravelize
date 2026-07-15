import { createContainer, type Container } from '@nuxt-laravelize/core/runtime'
import { AesGcmEncrypter, encrypterToken } from '@nuxt-laravelize/encryption/runtime'
import { CacheFake } from '@nuxt-laravelize/cache/testing'
import { cacheToken } from '@nuxt-laravelize/cache/runtime'
import { EventFake } from '@nuxt-laravelize/events/testing'
import { dispatcherToken } from '@nuxt-laravelize/events/runtime'
import { FilesystemFake } from '@nuxt-laravelize/filesystem/testing'
import { FilesystemManager, filesystemManagerToken } from '@nuxt-laravelize/filesystem/runtime'
import { Pbkdf2Hasher, hasherToken } from '@nuxt-laravelize/hashing/runtime'
import { MailFake } from '@nuxt-laravelize/mail/testing'
import { mailerToken } from '@nuxt-laravelize/mail/runtime'
import { NotificationFake } from '@nuxt-laravelize/notifications/testing'
import { notificationManagerToken } from '@nuxt-laravelize/notifications/runtime'
import { FeatureManager, InMemoryFeatureStore, featureManagerToken } from '@nuxt-laravelize/pennant/runtime'
import { InMemorySearchEngine, ScoutManager, scoutManagerToken } from '@nuxt-laravelize/scout/runtime'
import { QueueFake } from '@nuxt-laravelize/queue/testing'
import { queueToken } from '@nuxt-laravelize/queue/runtime'
import { RateLimiter, rateLimiterToken } from '@nuxt-laravelize/rate-limiter/runtime'
import { Validator, validatorToken } from '@nuxt-laravelize/validation/runtime'

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
  readonly encrypter: AesGcmEncrypter
  readonly filesystem: FilesystemFake
  readonly hasher: Pbkdf2Hasher
  readonly queue: QueueFake
  readonly mail: MailFake
  readonly notifications: NotificationFake
  readonly features: FeatureManager
  readonly scout: ScoutManager
  readonly rateLimiter: RateLimiter
  readonly validator: Validator
}

export function mountLaravelize(): MountedLaravelize {
  const container = createContainer()
  const cache = new CacheFake()
  const events = new EventFake()
  const encrypter = new AesGcmEncrypter('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  const filesystem = new FilesystemFake()
  const hasher = new Pbkdf2Hasher(10_000)
  const queue = new QueueFake()
  const mail = new MailFake()
  const notifications = new NotificationFake()
  const features = new FeatureManager(new InMemoryFeatureStore())
  const scout = new ScoutManager('memory').extend('memory', () => new InMemorySearchEngine())
  const rateLimiter = new RateLimiter(cache)
  const validator = new Validator()
  container.instance(dispatcherToken, events)
  container.instance(encrypterToken, encrypter)
  container.instance(filesystemManagerToken, new FilesystemManager().register('default', filesystem))
  container.instance(hasherToken, hasher)
  container.instance(cacheToken, cache)
  container.instance(queueToken, queue)
  container.instance(mailerToken, mail)
  container.instance(notificationManagerToken, notifications as never)
  container.instance(featureManagerToken, features)
  container.instance(scoutManagerToken, scout)
  container.instance(rateLimiterToken, rateLimiter)
  container.instance(validatorToken, validator)
  container.seal()
  return { container, cache, encrypter, events, features, filesystem, hasher, queue, mail, notifications, scout, rateLimiter, validator }
}
