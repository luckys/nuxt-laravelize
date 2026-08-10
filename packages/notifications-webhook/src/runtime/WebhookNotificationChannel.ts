import type { Notifiable, Notification, NotificationChannel, NotificationDeliveryContext } from '@luckys_luis/nuxt-laravelize-notifications/runtime'
import { createEnvelope, type JsonValue, type OutboxStore } from '@luckys_luis/nuxt-laravelize-reliability'
import { createWebhookEnvelope } from '@luckys_luis/nuxt-laravelize-webhooks'
import type { WebhookNotificationEndpointResolver, WebhookNotificationJsonObject } from './contracts'
import { assertWebhookNotificationBodySize, canonicalWebhookNotificationTimestamp, normalizeWebhookNotificationData, normalizeWebhookNotificationEndpoint, normalizeWebhookNotificationRoute, normalizeWebhookNotificationVersion, safeWebhookNotificationText } from './validation'

interface WebhookNotification extends Notification {
  webhookType(): string
  webhookVersion(): number
  toWebhook(notifiable: Notifiable, context?: NotificationDeliveryContext): WebhookNotificationJsonObject | Promise<WebhookNotificationJsonObject>
}

export class InvalidWebhookNotificationError extends TypeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidWebhookNotificationError'
  }
}

export class WebhookNotificationChannel implements NotificationChannel {
  constructor(
    private readonly outbox: OutboxStore,
    private readonly endpoints: WebhookNotificationEndpointResolver,
    private readonly currentTenant?: () => string | undefined,
    private readonly idFactory: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
    private readonly requireDurable = process.env.NODE_ENV === 'production',
  ) {}

  async send(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    context?.signal?.throwIfAborted()
    if (this.requireDurable && this.outbox.durability !== 'durable') throw new InvalidWebhookNotificationError('A durable webhook notification outbox is required in production')
    if (!isWebhookNotification(notification)) throw new InvalidWebhookNotificationError('Webhook notifications require webhookType(), webhookVersion(), and toWebhook()')
    let route
    try {
      route = normalizeWebhookNotificationRoute(notifiable.routeNotificationFor('webhook', notification))
    }
    catch (error) { throw new InvalidWebhookNotificationError('Invalid webhook notification route', { cause: error }) }
    const contextTenant = context?.tenantId
    const ambientTenant = this.currentTenant?.()
    if (contextTenant !== undefined) safeWebhookNotificationText(contextTenant, 'tenant id')
    if (ambientTenant !== undefined) safeWebhookNotificationText(ambientTenant, 'tenant id')
    if (contextTenant !== undefined && ambientTenant !== undefined && contextTenant !== ambientTenant) throw new InvalidWebhookNotificationError('Webhook notification execution tenant mismatch')
    const trustedTenant = contextTenant ?? ambientTenant
    assertTenant(route.tenantId, trustedTenant, 'route')
    const resolved = await this.endpoints.resolve(route.endpointId, { ...(trustedTenant ? { tenantId: trustedTenant } : {}), ...(context?.signal ? { signal: context.signal } : {}) })
    context?.signal?.throwIfAborted()
    if (!resolved) throw new InvalidWebhookNotificationError('Webhook notification endpoint was not found')
    let endpoint
    try {
      endpoint = normalizeWebhookNotificationEndpoint(resolved)
    }
    catch (error) { throw new InvalidWebhookNotificationError('Invalid resolved webhook notification endpoint', { cause: error }) }
    if (endpoint.endpointId !== route.endpointId) throw new InvalidWebhookNotificationError('Webhook notification endpoint identity mismatch')
    assertTenant(endpoint.tenantId, trustedTenant, 'endpoint')
    if (trustedTenant !== undefined && endpoint.tenantId === undefined) throw new InvalidWebhookNotificationError('Webhook notification endpoint did not prove trusted tenant ownership')
    if (route.tenantId !== undefined && endpoint.tenantId !== undefined && route.tenantId !== endpoint.tenantId) throw new InvalidWebhookNotificationError('Webhook notification route and endpoint tenant mismatch')
    const type = safeWebhookNotificationText(notification.webhookType(), 'type')
    const version = normalizeWebhookNotificationVersion(notification.webhookVersion())
    const data = normalizeWebhookNotificationData(await notification.toWebhook(notifiable, context))
    context?.signal?.throwIfAborted()
    const id = safeWebhookNotificationText(context?.idempotencyKey ?? this.idFactory(), 'delivery id')
    const occurredAt = canonicalWebhookNotificationTimestamp(context?.occurredAt ?? this.now().toISOString())
    const payload = { version, data, ...(context?.locale ? { locale: context.locale } : {}) } as unknown as JsonValue
    const body = createEnvelope({ id, type, occurredAt, payload, ...(trustedTenant ? { context: { tenantId: trustedTenant } } : {}) })
    assertWebhookNotificationBodySize(body)
    const delivery = createWebhookEnvelope({ url: endpoint.url, secretId: endpoint.secretId, body: body as unknown as JsonValue }, { id, occurredAt, ...(trustedTenant ? { context: { tenantId: trustedTenant } } : {}) })
    context?.signal?.throwIfAborted()
    await this.outbox.append(delivery)
  }
}

function assertTenant(candidate: string | undefined, trusted: string | undefined, source: string): void {
  if (candidate !== undefined && trusted === undefined) throw new InvalidWebhookNotificationError(`Webhook notification ${source} tenant requires trusted execution context`)
  if (candidate !== undefined && trusted !== candidate) throw new InvalidWebhookNotificationError(`Webhook notification ${source} tenant mismatch`)
}

function isWebhookNotification(notification: Notification): notification is WebhookNotification {
  const candidate = notification as Partial<WebhookNotification>
  return typeof candidate.webhookType === 'function' && typeof candidate.webhookVersion === 'function' && typeof candidate.toWebhook === 'function'
}
