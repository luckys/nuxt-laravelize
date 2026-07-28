# @nuxt-laravelize/notifications-webhook

Reliable, tenant-fenced notification delivery through the Node-only `@nuxt-laravelize/webhooks` outbox processor.

```bash
pnpm add @nuxt-laravelize/notifications-webhook @nuxt-laravelize/notifications @nuxt-laravelize/reliability @nuxt-laravelize/webhooks
```

The `webhook` route is only an opaque `{ endpointId, tenantId? }` reference. Bind a durable shared `OutboxStore` and a trusted endpoint resolver in an application provider:

```ts
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { webhookNotificationEndpointResolverToken, webhookNotificationOutboxStoreToken } from '@nuxt-laravelize/notifications-webhook/runtime'

export default class WebhookNotificationInfrastructure implements ServiceProvider {
  register(container: Container) {
    container.instance(webhookNotificationOutboxStoreToken, durableReliabilityStore)
    container.instance(webhookNotificationEndpointResolverToken, {
      resolve: async (endpointId, { tenantId, signal }) => endpointRepository.findEnabled({ endpointId, tenantId, signal }),
    })
  }
}
```

The resolver must query by trusted tenant and endpoint ID together, return the same `endpointId`, and prove tenant ownership in `tenantId`. It returns `{ endpointId, tenantId?, url, secretId }`; raw signing keys never enter the notification or outbox. URLs must use HTTPS on port 443 without credentials, query strings, or fragments. Notification content cannot set the destination, headers, or secret reference.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'
import type { WebhookNotificationJsonObject } from '@nuxt-laravelize/notifications-webhook/runtime'

export class OrderReady extends Notification {
  via() { return ['webhook'] }
  webhookType() { return 'order.ready' }
  webhookVersion() { return 1 }
  toWebhook(): WebhookNotificationJsonObject { return { orderId: 'order-1' } }
}
```

The HTTP body is a reliability envelope carrying `{ version, data, locale? }`. Queue delivery preserves one stable ID and occurrence time across notification inbox replay and webhook outbox delivery; direct callers that supply `idempotencyKey` must also reuse the same `occurredAt`. Conflicting reuse is rejected without replacing the original outbox record. Delivery is at least once, so receivers must deduplicate by envelope ID.

Production requires a durable outbox and a separately supervised `OutgoingWebhookProcessor`. Its `resolveSecret(secretId, context)` implementation must query tenant and secret ID together; context also carries the immutable delivery ID, URL, and lease-loss signal. Endpoint disablement must revoke its secret reference for already-published jobs. The outbox append is the channel's commit point and may complete after a concurrent cancellation; stable IDs make the subsequent replay safe. The underlying webhook transport validates DNS before every attempt and disables redirects, but DNS validation and connection are not atomically pinned. Use an allowlisted egress proxy or connection-level address pinning, plus network policy that blocks private and metadata ranges.
