import type { Resolver } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { notificationManagerToken } from '@luckys_luis/nuxt-laravelize-notifications/runtime'
import { isNonRetryableJobError, Job, NonRetryableJobError } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { ConsumerFailure, createEnvelope, InboxConsumer, type MessageExecutionContext } from '@luckys_luis/nuxt-laravelize-reliability'
import { validateQueuedNotificationPayload, type QueuedNotificationPayload } from './payload'
import { notificationCodecRegistryToken, notificationInboxStoreToken, notificationQueueOptionsToken, recipientResolverRegistryToken } from './tokens'

const LOCALE = /^[A-Z]{2,8}(?:-[A-Z0-9]{1,8}){0,3}$/i

export class QueuedNotificationJob extends Job<QueuedNotificationPayload> {
  static override readonly jobName = 'laravelize.notification-delivery.v1'
  static override readonly queue = 'laravelize.notifications'
  static override readonly tries = 5
  static override readonly backoff = 1000
  readonly payload: QueuedNotificationPayload

  constructor(payload: Record<string, unknown>) {
    super()
    try {
      this.payload = validateQueuedNotificationPayload(payload)
    }
    catch (error) { throw new NonRetryableJobError('INVALID_NOTIFICATION_PAYLOAD', 'Queued notification payload or version is invalid', { cause: error }) }
  }

  async handle(resolver: Resolver): Promise<void> {
    const options = resolver.has(notificationQueueOptionsToken) ? resolver.make(notificationQueueOptionsToken) : {}
    const inbox = resolver.has(notificationInboxStoreToken) ? resolver.make(notificationInboxStoreToken) : undefined
    const requireDurable = options.requireDurableInbox ?? process.env.NODE_ENV === 'production'
    if (requireDurable && inbox?.durability !== 'durable') throw new NonRetryableJobError('DURABLE_INBOX_REQUIRED', 'A durable notification inbox is required')
    if (!inbox) return this.deliver(resolver, { signal: options.signal ?? new AbortController().signal, leaseToken: this.payload.deliveryId, attempt: 1 })
    const consumer = new InboxConsumer(inbox, async (_message, context) => {
      try {
        await this.deliver(resolver, context!)
      }
      catch (error) {
        if (isNonRetryableJobError(error)) throw new ConsumerFailure(error instanceof Error ? error.message : 'Non-retryable notification failure', false)
        throw error
      }
    }, {
      owner: options.inboxOwner ?? 'laravelize.notifications',
      signal: options.signal,
    })
    const result = await consumer.consume(createEnvelope({ id: this.payload.deliveryId, type: QueuedNotificationJob.jobName, occurredAt: this.payload.occurredAt, payload: this.payload as unknown as import('@luckys_luis/nuxt-laravelize-reliability').JsonValue, ...(this.payload.tenantId ? { context: { tenantId: this.payload.tenantId } } : {}) }))
    if (result === 'busy' || result === 'retry') throw new Error(`Notification inbox requested ${result}`)
    if (result === 'dead') throw new NonRetryableJobError('NOTIFICATION_INBOX_DEAD', 'Notification delivery was marked dead by the inbox')
  }

  private async deliver(resolver: Resolver, execution: MessageExecutionContext): Promise<void> {
    const notification = resolver.make(notificationCodecRegistryToken).decode(this.payload.notification)
    const resolved = await resolver.make(recipientResolverRegistryToken).resolve(this.payload.recipient)
    if (!resolved) return
    if (resolved.locale !== undefined && !LOCALE.test(resolved.locale)) throw new NonRetryableJobError('INVALID_RECIPIENT_LOCALE', 'Trusted recipient resolver returned an invalid locale')
    const currentTenant = resolver.has(executionContextToken) ? resolver.make(executionContextToken).snapshot().tenantId : undefined
    if ((this.payload.tenantId ?? resolved.tenantId) !== resolved.tenantId || (currentTenant !== undefined && currentTenant !== resolved.tenantId)) throw new NonRetryableJobError('TENANT_MISMATCH', 'Notification tenant does not match the trusted recipient tenant')
    const currentChannels = notification.via(resolved.notifiable)
    const enabled = resolved.channels ?? currentChannels
    if (!enabled.includes(this.payload.channel) || !currentChannels.includes(this.payload.channel)) return
    await resolver.make(notificationManagerToken).sendChannel(this.payload.channel, resolved.notifiable, notification, { locale: resolved.locale, tenantId: resolved.tenantId, idempotencyKey: this.payload.deliveryId, occurredAt: this.payload.occurredAt, signal: execution.signal })
  }
}
