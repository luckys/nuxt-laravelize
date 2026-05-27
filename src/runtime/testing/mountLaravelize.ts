import { createContainer, type Container } from '../../core/container/Container'
import type { ServiceProvider } from '../../core/providers/ServiceProvider'
import { dispatcherToken } from '../../events/DispatcherToken'
import { queueToken } from '../../queue/QueueToken'
import { mailerToken } from '../../mail/MailerToken'
import { notificationManagerToken } from '../../notifications/NotificationManagerToken'
import { loggerToken } from '../../logging/LoggerToken'

import { FakeDispatcher } from './fakes/FakeDispatcher'
import { FakeQueue } from './fakes/FakeQueue'
import { FakeMailer } from './fakes/FakeMailer'
import { FakeNotificationManager } from './fakes/FakeNotificationManager'
import { FakeLogger } from './fakes/FakeLogger'

export interface MountFakes {
  readonly dispatcher?: boolean
  readonly queue?: boolean
  readonly mailer?: boolean
  readonly notifications?: boolean
  readonly logger?: boolean
}

export interface MountLaravelizeOptions {
  readonly providers?: readonly ServiceProvider[]
  readonly fakes?: MountFakes
}

export interface LaravelizeHarness {
  readonly container: Container
  readonly dispatcher: FakeDispatcher | null
  readonly queue: FakeQueue | null
  readonly mailer: FakeMailer | null
  readonly notifications: FakeNotificationManager | null
  readonly logger: FakeLogger | null
}

export async function mountLaravelize(options: MountLaravelizeOptions = {}): Promise<LaravelizeHarness> {
  const container = createContainer()
  const fakes = options.fakes ?? {}

  const dispatcher = fakes.dispatcher === true ? new FakeDispatcher() : null
  const queue = fakes.queue === true ? new FakeQueue() : null
  const mailer = fakes.mailer === true ? new FakeMailer() : null
  const notifications = fakes.notifications === true ? new FakeNotificationManager() : null
  const logger = fakes.logger === true ? new FakeLogger() : null

  if (dispatcher !== null) container.instance(dispatcherToken, dispatcher)
  if (queue !== null) container.instance(queueToken, queue)
  if (mailer !== null) container.instance(mailerToken, mailer)
  if (notifications !== null) container.instance(notificationManagerToken, notifications)
  if (logger !== null) container.instance(loggerToken, logger)

  const providers = options.providers ?? []
  for (const provider of providers) provider.register(container)
  for (const provider of providers) {
    if (provider.boot) await provider.boot(container)
  }

  return { container, dispatcher, queue, mailer, notifications, logger }
}
