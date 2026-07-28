# @nuxt-laravelize/notifications-queue

Opt-in durable queue bridge for versioned notifications and opaque recipient references.

```sh
pnpm add @nuxt-laravelize/notifications-queue @nuxt-laravelize/notifications @nuxt-laravelize/queue @nuxt-laravelize/reliability
```

Add the module in both producer and worker deployments. Register identical explicit notification codecs and recipient resolvers, then resolve `queuedNotificationDispatcherToken` to enqueue one job per current recipient/channel. Never use constructor names as durable identities.

The payload contains only codec type/version/data, channel, execution tenant metadata, and an opaque recipient type/version/id. The worker reloads the recipient, current preferences, locale, routes, and trusted tenant before delivery. Missing recipients and disabled channels are skipped. Unknown versions, malformed payloads, and tenant mismatches fail terminally.

Production requires a durable queue and a durable `InboxStore` bound to `notificationInboxStoreToken`; the default production policy fails closed when that store is absent. Register `QueuedNotificationJob` in every worker, retain failed BullMQ jobs, and use an outbox when enqueue must commit atomically with domain state. Completed inbox records suppress confirmed duplicates, but no bridge can promise universal exactly-once delivery after an external provider accepts an effect.
