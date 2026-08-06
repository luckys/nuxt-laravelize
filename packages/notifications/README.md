# `@nuxt-laravelize/notifications`

[Espanol](./README.es.md) | English

Extensible notification channels and on-demand routing for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/notifications
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/notifications'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Notifications

`@nuxt-laravelize/notifications` routes notifications through named channels. The base package registers only the log channel and does not pull in mail or queues. `useNotifications(event)` is auto-imported in Nitro.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['log'] as const }
  toLog() { return 'Invoice inv_1 was paid' }
}

const user = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : 'user_1',
}
await notifications.send(user, new InvoicePaid())
```

| API | Purpose |
|---|---|
| `DefaultNotificationManager.register()` | Registers a custom `NotificationChannel`. |
| `send()` / `sendNow()` | Sends to one or many notifiables through `via()`. |
| `route(channel, address)` | Starts an on-demand `PendingNotification`. Chain `.route()` and finish with `.notify()`. |
| `LogChannel.send()` | Logs `notification.toLog()` or `toArray()`. |
| `notificationManagerToken` | Resolves the configured manager. |
| `NotificationFake` | Records notifications and provides predicate, count, negative, and reset assertions. |
| `NotificationDelivered` | Observes a channel invocation that fulfilled. |
| `NotificationDeliveryFailed` | Observes a channel attempt that rejected or was aborted. |

```ts
await notifications
  .route('log', 'user_1')
  .notify(new InvoicePaid())
```

`NotificationFake.assertSentTo()` accepts an optional predicate with the typed notification and the channels selected by `via()`. Tests can also use `assertSentToTimes()`, `assertSentTimes()`, `assertNotSentTo()`, `assertCount()`, `assertNothingSent()`, and `reset()`. The fake records intent without invoking channels or emitting lifecycle events.

When `@nuxt-laravelize/events` is also registered, the manager dispatches privacy-bounded lifecycle events around delivery attempts. Trusted listeners can explicitly access the non-enumerable `notifiable`, `notification`, and failure `error`; generic serialization exposes only the channel, event type, a failure's `aborted` flag, and copied `locale`, `tenantId`, `idempotencyKey`, and `occurredAt` metadata. The events implement no durable or queued payload contract, and listener failures are logged with safe metadata then isolated from the original channel result. Normal dispatcher ordering still applies between observers: a thrown error or `false` return stops later listeners for that event.

`NotificationDelivered` means that the channel method fulfilled: a database write or webhook outbox append was accepted, or a mail/broadcast provider call returned. It does not prove inbox receipt or final webhook HTTP delivery. `NotificationDeliveryFailed` describes one delivery attempt, including a signal already aborted before channel invocation, not exhaustion of queue retries. Missing recipients, disabled channels, malformed queued payloads, and tenant mismatches rejected before manager invocation emit neither event. Worker crashes and at-least-once execution can omit or duplicate observations, so side-effecting listeners must durably deduplicate by tenant, idempotency key, channel, and event type. Do not use these best-effort events as the sole audit ledger; `NotificationFake` does not emit them.

Install `@nuxt-laravelize/notifications-mail` to register the opt-in `mail` channel. A notification implements `toMail()` while the recipient address comes only from `routeNotificationFor('mail')`; content cannot override destinations. The channel accepts one plain address per route entry, rejects header/list injection and bounded-resource violations, and forwards locale, abort signal, and idempotency key to the configured mailer.

Install `@nuxt-laravelize/notifications-database` to register the opt-in `database` channel. Notifications declare explicit `databaseType()`, `databaseVersion()`, and bounded `toDatabase()` JSON; recipients expose an opaque `{ type, id, tenantId? }` route. Tenant scope must match trusted execution context. `useDatabaseNotifications(event)` provides cursor-based listing and tenant-fenced `markRead()` / `markUnread()` operations. Development may use bounded memory, while production requires a durable store such as `@nuxt-laravelize/notifications-database-drizzle`. Idempotent retries suppress identical content and reject conflicting reuse.

Install `@nuxt-laravelize/notifications-broadcast` to register the opt-in `broadcast` channel. Notifications declare explicit `broadcastType()`, `broadcastVersion()`, and bounded `toBroadcast()` JSON; recipients expose an opaque `{ type, id, tenantId? }` route. The package derives one deterministic private channel from the trusted tenant and recipient, and emits a fixed `notification.created` event carrying `{ id, type, version, data, locale? }`. Content cannot override the destination or event. Use `broadcastNotificationChannelName()` for authorization and browser subscription, and configure a server adapter such as `@nuxt-laravelize/broadcasting-pusher` separately. Delivery remains at-least-once at provider boundaries; clients should deduplicate by `id`. This package does not host WebSockets or install a browser client.

Install `@nuxt-laravelize/notifications-webhook` to register the opt-in, Node-only `webhook` channel. Notifications provide `webhookType()`, `webhookVersion()`, and bounded `toWebhook()` JSON while recipients expose only `{ endpointId, tenantId? }`. Bind `webhookNotificationOutboxStoreToken` to a durable shared outbox and `webhookNotificationEndpointResolverToken` to a trusted resolver that queries endpoint ownership by tenant and ID together. Notification content cannot select URLs, headers, or keys; the resolver returns a queryless HTTPS URL and opaque `secretId`, and must prove trusted tenant ownership. Queue replay preserves one ID and occurrence time across inbox and outbox stages. Run `OutgoingWebhookProcessor` separately and resolve signing keys by both `context.tenantId` and `secretId`; require receiver deduplication, revoke endpoint keys when disabling already-published endpoints, and use pinned or allowlisted egress because DNS validation alone cannot eliminate rebinding.

`@nuxt-laravelize/notifications-queue` exposes `QueuedNotificationDispatcher`, explicit type/version codec and recipient-resolver registries, and the versioned `QueuedNotificationJob`. It serializes no route/address or `Notifiable`; workers reload the current recipient, preferences, locale, channels, and trusted tenant before delivering exactly one encoded channel. Missing recipients or disabled channels are skipped, while malformed/unknown versions and tenant mismatch are terminal. A notification may implement `withDelay(notifiable)` and return per-channel delays in whole milliseconds from 0 through 86,400,000; the complete recipient/channel plan is validated before its first job is pushed and delays are applied as queue metadata. An omitted channel keeps the queue backend's default delay, while an explicit `0` overrides it with immediate availability. Direct notification delivery remains immediate. Production requires a durable queue and durable `InboxStore`; use an outbox when enqueue must commit with domain state. Inbox completion suppresses confirmed duplicates, but external providers still determine whether the final effect supports idempotency. Its one-second queue backoff matches the default inbox retry delay so retry attempts do not exhaust while a failed claim is still unavailable. Lifecycle events preserve the queued delivery ID and original occurrence time, but remain attempt-level and non-durable.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#notifications). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/notifications-mail`](../notifications-mail/README.md), [`@nuxt-laravelize/notifications-database`](../notifications-database/README.md), [`@nuxt-laravelize/notifications-queue`](../notifications-queue/README.md).
