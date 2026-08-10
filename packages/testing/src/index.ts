import { createContainer, type Container } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { auditStoreToken } from '@luckys_luis/nuxt-laravelize-audit/runtime'
import { AuditFake } from '@luckys_luis/nuxt-laravelize-audit/testing'
import { AesGcmEncrypter, encrypterToken } from '@luckys_luis/nuxt-laravelize-encryption/runtime'
import { executionContextToken, type ExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { fakeExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/testing'
import { CacheFake } from '@luckys_luis/nuxt-laravelize-cache/testing'
import { cacheToken } from '@luckys_luis/nuxt-laravelize-cache/runtime'
import { EventFake } from '@luckys_luis/nuxt-laravelize-events/testing'
import { dispatcherToken } from '@luckys_luis/nuxt-laravelize-events/runtime'
import { FilesystemFake } from '@luckys_luis/nuxt-laravelize-filesystem/testing'
import { FilesystemManager, filesystemManagerToken } from '@luckys_luis/nuxt-laravelize-filesystem/runtime'
import { Pbkdf2Hasher, hasherToken } from '@luckys_luis/nuxt-laravelize-hashing/runtime'
import { MailFake } from '@luckys_luis/nuxt-laravelize-mail/testing'
import { mailerToken } from '@luckys_luis/nuxt-laravelize-mail/runtime'
import { NotificationFake } from '@luckys_luis/nuxt-laravelize-notifications/testing'
import { notificationManagerToken } from '@luckys_luis/nuxt-laravelize-notifications/runtime'
import { FeatureManager, InMemoryFeatureStore, featureManagerToken } from '@luckys_luis/nuxt-laravelize-pennant/runtime'
import { InMemorySearchEngine, ScoutManager, scoutManagerToken } from '@luckys_luis/nuxt-laravelize-scout/runtime'
import { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'
import { queueToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { RateLimiter, rateLimiterToken } from '@luckys_luis/nuxt-laravelize-rate-limiter/runtime'
import { Validator, validatorToken } from '@luckys_luis/nuxt-laravelize-validation/runtime'

export { FakeLogger } from '@luckys_luis/nuxt-laravelize-core/testing'
export { AuditFake } from '@luckys_luis/nuxt-laravelize-audit/testing'
export { BroadcastFake } from '@luckys_luis/nuxt-laravelize-broadcasting/testing'
export { ExecutionContextBuilder, fakeExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/testing'
export { CacheFake } from '@luckys_luis/nuxt-laravelize-cache/testing'
export { EventFake } from '@luckys_luis/nuxt-laravelize-events/testing'
export { FilesystemFake } from '@luckys_luis/nuxt-laravelize-filesystem/testing'
export { MailFake } from '@luckys_luis/nuxt-laravelize-mail/testing'
export { NotificationFake } from '@luckys_luis/nuxt-laravelize-notifications/testing'
export { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'

export interface MountedLaravelize {
  readonly container: Container
  readonly audit: AuditFake
  readonly cache: CacheFake
  readonly events: EventFake
  readonly encrypter: AesGcmEncrypter
  readonly executionContext: ExecutionContext
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
  const audit = new AuditFake()
  const cache = new CacheFake()
  const events = new EventFake()
  const encrypter = new AesGcmEncrypter('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  const executionContext = fakeExecutionContext()
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
  container.instance(auditStoreToken, audit)
  container.instance(encrypterToken, encrypter)
  container.instance(executionContextToken, executionContext)
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
  return { container, audit, cache, encrypter, executionContext, events, features, filesystem, hasher, queue, mail, notifications, scout, rateLimiter, validator }
}
