import type { Logger, Resolver } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Dispatcher } from '@luckys_luis/nuxt-laravelize-events/runtime'
import type { ChannelName, Notifiable, Notification, NotificationChannel, NotificationDeliveryContext } from './contracts'
import { NotificationDelivered, NotificationDeliveryFailed, type NotificationDeliveryEventContext } from './NotificationEvents'

export class UnknownNotificationChannel extends Error {
  constructor(channel: string) {
    super(`No notification channel registered for "${channel}".`)
    this.name = 'UnknownNotificationChannel'
  }
}

export class NotificationChannelRegistry {
  readonly #channels = new Map<string, NotificationChannel | ((resolver: Resolver) => NotificationChannel)>()
  register(name: string, channel: NotificationChannel | ((resolver: Resolver) => NotificationChannel)): void {
    if (!name || this.#channels.has(name)) throw new TypeError(`Duplicate or invalid notification channel: ${name}`)
    this.#channels.set(name, channel)
  }

  entries(resolver?: Resolver): IterableIterator<[string, NotificationChannel]> {
    return [...this.#channels].map(([name, channel]) => {
      if (typeof channel !== 'function') return [name, channel] as [string, NotificationChannel]
      if (!resolver) throw new TypeError('A resolver is required for notification channel factories')
      return [name, channel(resolver)] as [string, NotificationChannel]
    }).values()
  }
}

export interface NotificationManagerOptions {
  readonly dispatcher?: Pick<Dispatcher, 'dispatch'>
  readonly logger?: Logger
}

export class DefaultNotificationManager {
  readonly #channels = new Map<string, NotificationChannel>()

  constructor(
    channels?: NotificationChannelRegistry,
    resolver?: Resolver,
    private readonly options: NotificationManagerOptions = {},
  ) {
    if (channels) for (const [name, channel] of channels.entries(resolver)) this.#channels.set(name, channel)
  }

  register(name: string, channel: NotificationChannel): void { this.#channels.set(name, channel) }

  async send(notifiable: Notifiable | readonly Notifiable[], notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    const recipients = Array.isArray(notifiable) ? notifiable : [notifiable]
    for (const recipient of recipients) await this.sendNow(recipient, notification, context)
  }

  async sendNow(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    for (const name of notification.via(notifiable)) {
      await this.sendChannel(name, notifiable, notification, context)
    }
  }

  async sendChannel(name: ChannelName, notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    try {
      context?.signal?.throwIfAborted()
      const channel = this.#channels.get(name)
      if (!channel) throw new UnknownNotificationChannel(name)
      if (context === undefined) await channel.send(notifiable, notification)
      else await channel.send(notifiable, notification, context)
    }
    catch (error) {
      await this.#dispatchLifecycleEvent(new NotificationDeliveryFailed(
        notifiable,
        notification,
        name,
        deliveryEventContext(context),
        error,
        context?.signal?.aborted === true || isAbortError(error),
      ))
      throw error
    }

    await this.#dispatchLifecycleEvent(new NotificationDelivered(notifiable, notification, name, deliveryEventContext(context)))
  }

  route(channel: ChannelName, address: unknown): PendingNotification {
    return new PendingNotification(this).route(channel, address)
  }

  async #dispatchLifecycleEvent(event: NotificationDelivered | NotificationDeliveryFailed): Promise<void> {
    if (!this.options.dispatcher) return
    try {
      await this.options.dispatcher.dispatch(event)
    }
    catch (error) {
      try {
        this.options.logger?.warn('notification lifecycle listener failed', {
          channel: event.channel,
          event: event.type,
          errorType: error instanceof Error ? error.name : typeof error,
        })
      }
      catch { /* Observers cannot alter notification delivery. */ }
    }
  }
}

export class PendingNotification {
  readonly #routes = new Map<ChannelName, unknown>()

  constructor(private readonly manager: DefaultNotificationManager) {}

  route(channel: ChannelName, address: unknown): this {
    this.#routes.set(channel, address)
    return this
  }

  notify(notification: Notification): Promise<void> {
    return this.manager.sendNow({ routeNotificationFor: channel => this.#routes.get(channel) }, notification)
  }
}

function deliveryEventContext(context?: NotificationDeliveryContext): NotificationDeliveryEventContext {
  return Object.freeze({
    ...(context?.idempotencyKey !== undefined ? { idempotencyKey: context.idempotencyKey } : {}),
    ...(context?.locale !== undefined ? { locale: context.locale } : {}),
    ...(context?.occurredAt !== undefined ? { occurredAt: context.occurredAt } : {}),
    ...(context?.tenantId !== undefined ? { tenantId: context.tenantId } : {}),
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
