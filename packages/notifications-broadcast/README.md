# @nuxt-laravelize/notifications-broadcast

Tenant-fenced realtime delivery for `@nuxt-laravelize/notifications` through the configured server-side broadcaster.

```bash
pnpm add @nuxt-laravelize/notifications-broadcast @nuxt-laravelize/notifications @nuxt-laravelize/broadcasting
```

Add the module after configuring a production broadcaster such as `@nuxt-laravelize/broadcasting-pusher`. The `broadcast` route is an opaque `{ type, id, tenantId? }` recipient reference; notification content cannot select or override its private channel.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'
import type { BroadcastNotificationJsonObject } from '@nuxt-laravelize/notifications-broadcast/runtime'

export class OrderReady extends Notification {
  via() { return ['broadcast'] }
  broadcastType() { return 'order.ready' }
  broadcastVersion() { return 1 }
  toBroadcast(): BroadcastNotificationJsonObject { return { orderId: 'order-1' } }
}
```

The fixed `notification.created` event carries `{ id, type, version, data, locale? }`. Private channel names are deterministic hashes of tenant and recipient identity; use `broadcastNotificationChannelName()` when authorizing or subscribing. Trusted execution context must match tenant-bearing routes.

Delivery is at-least-once at external broadcaster boundaries. Queue deliveries expose their stable idempotency key as `id`; clients should deduplicate by it. This package does not host WebSockets, install a browser client, or make provider delivery durable.
