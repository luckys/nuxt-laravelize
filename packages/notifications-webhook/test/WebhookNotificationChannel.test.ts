import { createContainer } from '@nuxt-laravelize/core/runtime'
import { Notification, NotificationChannelRegistry, notificationChannelRegistryToken } from '@nuxt-laravelize/notifications/runtime'
import { OutboxMessageConflictError } from '@nuxt-laravelize/reliability'
import { InMemoryReliabilityStore } from '@nuxt-laravelize/reliability/testing'
import { OutgoingWebhookProcessor } from '@nuxt-laravelize/webhooks'
import { describe, expect, it, vi } from 'vitest'
import { InvalidWebhookNotificationError, WebhookNotificationChannel, type WebhookNotificationEndpoint, type WebhookNotificationEndpointResolver, type WebhookNotificationJsonObject, webhookNotificationEndpointResolverToken, webhookNotificationOutboxStoreToken } from '../src/runtime/index'
import NotificationsWebhookServiceProvider from '../src/runtime/server/NotificationsWebhookServiceProvider'

const occurredAt = '2026-01-01T00:00:00.000Z'

class EndpointResolver implements WebhookNotificationEndpointResolver {
  constructor(public endpoint: WebhookNotificationEndpoint | null = { endpointId: 'orders', tenantId: 'tenant-1', url: 'https://hooks.example.test/orders', secretId: 'orders-key-v1' }) {}
  readonly calls: Array<{ endpointId: string, context: { tenantId?: string, signal?: AbortSignal } }> = []
  async resolve(endpointId: string, context: { tenantId?: string, signal?: AbortSignal }) {
    this.calls.push({ endpointId, context })
    return this.endpoint
  }
}

class OrderReady extends Notification {
  readonly internalSecret = 'never-reflect-this'
  constructor(private readonly data: WebhookNotificationJsonObject = { orderId: 'order-1' }) { super() }
  via() { return ['webhook'] }
  webhookType() { return 'order.ready' }
  webhookVersion() { return 2 }
  toWebhook() { return this.data }
}

const recipient = (tenantId?: string) => ({ routeNotificationFor: () => ({ endpointId: 'orders', ...(tenantId ? { tenantId } : {}) }) })

describe('webhook notification channel', () => {
  it('registers the opt-in channel through its service provider', () => {
    const container = createContainer()
    container.instance(notificationChannelRegistryToken, new NotificationChannelRegistry())
    container.instance(webhookNotificationOutboxStoreToken, new InMemoryReliabilityStore())
    container.instance(webhookNotificationEndpointResolverToken, new EndpointResolver())
    new NotificationsWebhookServiceProvider().boot(container)
    expect([...container.make(notificationChannelRegistryToken).entries(container)]).toEqual([['webhook', expect.any(WebhookNotificationChannel)]])
  })

  it('appends one immutable signed-webhook job with a tenant-fenced notification envelope', async () => {
    const outbox = new InMemoryReliabilityStore()
    const endpoints = new EndpointResolver()
    const channel = new WebhookNotificationChannel(outbox, endpoints, () => 'tenant-1', undefined, undefined, false)
    await channel.send(recipient('tenant-1'), new OrderReady(), { tenantId: 'tenant-1', locale: 'es', idempotencyKey: 'delivery-1', occurredAt })
    expect(endpoints.calls).toEqual([{ endpointId: 'orders', context: { tenantId: 'tenant-1' } }])
    expect(outbox.records.get('outbox:delivery-1')?.envelope).toEqual({
      version: 1,
      id: 'delivery-1',
      type: 'webhook.delivery.v1',
      occurredAt,
      context: { tenantId: 'tenant-1' },
      payload: {
        url: 'https://hooks.example.test/orders',
        secretId: 'orders-key-v1',
        body: {
          version: 1,
          id: 'delivery-1',
          type: 'order.ready',
          occurredAt,
          context: { tenantId: 'tenant-1' },
          payload: { version: 2, data: { orderId: 'order-1' }, locale: 'es' },
        },
      },
    })
    expect(JSON.stringify(outbox.records.get('outbox:delivery-1'))).not.toContain('never-reflect-this')
  })

  it('makes identical queue replays no-ops and rejects changed endpoint content under the same delivery id', async () => {
    const outbox = new InMemoryReliabilityStore()
    const endpoints = new EndpointResolver()
    const channel = new WebhookNotificationChannel(outbox, endpoints, () => 'tenant-1', undefined, undefined, false)
    const context = { tenantId: 'tenant-1', idempotencyKey: 'delivery-1', occurredAt }
    await channel.send(recipient('tenant-1'), new OrderReady(), context)
    await channel.send(recipient('tenant-1'), new OrderReady(), context)
    expect([...outbox.records.keys()]).toEqual(['outbox:delivery-1'])
    endpoints.endpoint = { ...endpoints.endpoint!, url: 'https://hooks.example.test/orders-v2' }
    await expect(channel.send(recipient('tenant-1'), new OrderReady(), context)).rejects.toBeInstanceOf(OutboxMessageConflictError)
    expect((outbox.records.get('outbox:delivery-1')?.envelope.payload as { url: string }).url).toBe('https://hooks.example.test/orders')
  })

  it('produces a body accepted by the outgoing webhook processor without following redirects', async () => {
    const outbox = new InMemoryReliabilityStore()
    const channel = new WebhookNotificationChannel(outbox, new EndpointResolver(), () => 'tenant-1', undefined, undefined, false)
    await channel.send(recipient('tenant-1'), new OrderReady(), { tenantId: 'tenant-1', idempotencyKey: 'delivery-1', occurredAt })
    const requests: Array<{ url: string, init: RequestInit }> = []
    const processor = new OutgoingWebhookProcessor(outbox, {
      owner: 'worker-1',
      resolveSecret: async () => 'a-secure-secret-value',
      resolver: async () => ['93.184.216.34'],
      clock: () => new Date(occurredAt),
      transport: { send: async (url: string, init: RequestInit) => {
        requests.push({ url, init })
        return { status: 204, headers: new Headers() }
      } },
    })
    expect((await processor.runOnce()).delivered).toBe(1)
    expect(requests[0]?.url).toBe('https://hooks.example.test/orders')
    expect(requests[0]?.init.redirect).toBe('manual')
    expect(JSON.parse(requests[0]?.init.body as string)).toMatchObject({ id: 'delivery-1', type: 'order.ready', payload: { version: 2 } })
  })

  it('fails closed for untrusted, spoofed, or mismatched tenant identities', async () => {
    const outbox = new InMemoryReliabilityStore()
    await expect(new WebhookNotificationChannel(outbox, new EndpointResolver(), undefined, undefined, undefined, false).send(recipient('tenant-1'), new OrderReady())).rejects.toThrow(/route tenant requires trusted/)
    await expect(new WebhookNotificationChannel(outbox, new EndpointResolver(), () => 'tenant-2', undefined, undefined, false).send(recipient('tenant-1'), new OrderReady())).rejects.toThrow(/route tenant mismatch/)
    await expect(new WebhookNotificationChannel(outbox, new EndpointResolver(), () => 'tenant-1', undefined, undefined, false).send(recipient('tenant-1'), new OrderReady(), { tenantId: 'tenant-2' })).rejects.toThrow(/execution tenant mismatch/)
    const wrongEndpoint = new EndpointResolver({ endpointId: 'orders', tenantId: 'tenant-2', url: 'https://hooks.example.test/orders', secretId: 'key-v1' })
    await expect(new WebhookNotificationChannel(outbox, wrongEndpoint, () => 'tenant-1', undefined, undefined, false).send(recipient('tenant-1'), new OrderReady())).rejects.toThrow(/endpoint tenant mismatch/)
    const unprovenEndpoint = new EndpointResolver({ endpointId: 'orders', url: 'https://hooks.example.test/orders', secretId: 'key-v1' })
    await expect(new WebhookNotificationChannel(outbox, unprovenEndpoint, () => 'tenant-1', undefined, undefined, false).send(recipient('tenant-1'), new OrderReady())).rejects.toThrow(/prove trusted tenant ownership/)
    const wrongIdentity = new EndpointResolver({ endpointId: 'other', tenantId: 'tenant-1', url: 'https://hooks.example.test/orders', secretId: 'key-v1' })
    await expect(new WebhookNotificationChannel(outbox, wrongIdentity, () => 'tenant-1', undefined, undefined, false).send(recipient('tenant-1'), new OrderReady())).rejects.toThrow(/identity mismatch/)
    expect(outbox.records.size).toBe(0)
  })

  it('rejects unsafe contracts, destinations, data, and volatile production stores before append', async () => {
    const outbox = new InMemoryReliabilityStore()
    const endpoints = new EndpointResolver()
    await expect(new WebhookNotificationChannel(outbox, endpoints, undefined, undefined, undefined, true).send(recipient(), new OrderReady())).rejects.toThrow(/durable/)
    const channel = new WebhookNotificationChannel(outbox, endpoints, undefined, undefined, undefined, false)
    const invalidNotification = new class extends Notification {
      via() { return ['webhook'] }
    }()
    await expect(channel.send(recipient(), invalidNotification)).rejects.toBeInstanceOf(InvalidWebhookNotificationError)
    endpoints.endpoint = { endpointId: 'orders', url: 'https://hooks.example.test/orders?token=secret', secretId: 'key-v1' }
    await expect(channel.send(recipient(), new OrderReady())).rejects.toThrow(/Invalid resolved webhook notification endpoint/)
    endpoints.endpoint = { endpointId: 'orders', url: 'https://hooks.example.test/orders', secretId: 'key-v1' }
    await expect(channel.send(recipient(), new OrderReady({ value: Number.NaN }))).rejects.toThrow(/JSON-safe/)
    const getter = vi.fn(() => 'secret')
    const data = Object.defineProperty({}, 'secret', { enumerable: true, get: getter })
    await expect(channel.send(recipient(), new OrderReady(data as WebhookNotificationJsonObject))).rejects.toThrow(/accessors/)
    expect(getter).not.toHaveBeenCalled()
    const arrayGetter = vi.fn(() => 'secret')
    const values: unknown[] = []
    Object.defineProperty(values, '0', { enumerable: true, get: arrayGetter })
    values.length = 1
    await expect(channel.send(recipient(), new OrderReady({ values } as WebhookNotificationJsonObject))).rejects.toThrow(/accessors/)
    expect(arrayGetter).not.toHaveBeenCalled()
    await expect(channel.send(recipient(), new OrderReady({ values: Array.from({ length: 4_998 }, () => Number.MAX_VALUE) }))).rejects.toThrow(/too large/)
    expect(outbox.records.size).toBe(0)
  })

  it('honors aborts after endpoint lookup and rendering', async () => {
    const outbox = new InMemoryReliabilityStore()
    const endpointAbort = new AbortController()
    const endpoints: WebhookNotificationEndpointResolver = { resolve: async () => {
      endpointAbort.abort()
      return { endpointId: 'orders', url: 'https://hooks.example.test/orders', secretId: 'key-v1' }
    } }
    await expect(new WebhookNotificationChannel(outbox, endpoints, undefined, undefined, undefined, false).send(recipient(), new OrderReady(), { signal: endpointAbort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    const renderAbort = new AbortController()
    const notification = new class extends OrderReady {
      override toWebhook() {
        renderAbort.abort()
        return { ok: true }
      }
    }()
    await expect(new WebhookNotificationChannel(outbox, new EndpointResolver({ endpointId: 'orders', url: 'https://hooks.example.test/orders', secretId: 'key-v1' }), undefined, undefined, undefined, false).send(recipient(), notification, { signal: renderAbort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(outbox.records.size).toBe(0)
  })
})
