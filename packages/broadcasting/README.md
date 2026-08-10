# `@luckys_luis/nuxt-laravelize-broadcasting`

[Espanol](./README.es.md) | English

Server-side Laravel-style broadcasting for Nuxt

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-broadcasting
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-broadcasting'],
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

## Broadcasting

`@luckys_luis/nuxt-laravelize-broadcasting` is included in the preset and bridges dispatched `ShouldBroadcast` events to public, private, or presence channels. Every event must implement `broadcastWith()` explicitly; event properties are never reflected, preventing accidental payload leakage. Register private and presence authorization rules with the request-scoped `useBroadcastChannels(event)` registry. The preset fails closed by default; the bounded memory driver must be enabled explicitly for development or tests.

```ts
import { PrivateChannel } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

class OrderUpdated {
  constructor(readonly orderId: string, readonly internalNote: string) {}
  broadcastOn() { return new PrivateChannel(`orders.${this.orderId}`) }
  broadcastAs() { return 'order.updated' }
  broadcastWith() { return { orderId: this.orderId } }
}

useBroadcastChannels(event).channel('orders.{orderId}', (user, { orderId }) => userCanView(user, orderId))
```

`@luckys_luis/nuxt-laravelize-broadcasting-pusher` is an opt-in **server adapter**. Inject `PusherBroadcaster` through `broadcasterToken` and keep credentials in private runtime config. It does not provide or install a browser WebSocket client or Laravel Echo; choose and configure client subscriptions separately.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#broadcasting). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-broadcasting-pusher`](../broadcasting-pusher/README.md), [`@luckys_luis/nuxt-laravelize-notifications-broadcast`](../notifications-broadcast/README.md).
