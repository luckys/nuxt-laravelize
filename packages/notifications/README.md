# @nuxt-laravelize/notifications

Notifications, custom channels, on-demand routing, and privacy-bounded delivery lifecycle events. The base package contains only the log channel and does not install mail or queue.

`NotificationFake` records notification intent and supports typed predicates over notification state and selected channels, per-recipient and global type counts, negative assertions, total counts, and reset. It invokes neither channels nor lifecycle events.

When `@nuxt-laravelize/events` is also registered, each delivery attempt emits `NotificationDelivered` after the channel fulfills or `NotificationDeliveryFailed` with the original failure, including cancellation before channel invocation. These synchronous events are best-effort observations: handlers cannot change delivery outcomes, must deduplicate queued deliveries by the stable idempotency key, and must not log the non-enumerable recipient, notification, or error references. They deliberately provide no durable event payload.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#notifications) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#notifications) guide for channels, routing and testing examples.
