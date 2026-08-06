# `@nuxt-laravelize/events`

[Espanol](./README.es.md) | English

Synchronous events and listeners for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/events
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/events'],
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

## Events

`@nuxt-laravelize/events` dispatches events synchronously. Listener definitions registered during boot are shared with request and worker dispatchers, while listener instances and their dependencies are resolved from the current scope.

```bash
pnpm add @nuxt-laravelize/events
```

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'
import { InMemoryDispatcher, type Listener } from '@nuxt-laravelize/events/runtime'

class UserRegistered {
  constructor(readonly userId: string) {}
  toPayload() { return [this.userId] }
}

const listenerToken = createToken<Listener<UserRegistered>>('listeners.welcome-user')
const container = createContainer()
container.singleton(listenerToken, () => ({
  handle: async event => console.log(`Welcome ${event.userId}`),
}))

const events = new InMemoryDispatcher(container)
events.listen(UserRegistered, listenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Purpose |
|---|---|
| `listen(Event, listenerToken)` | Registers a listener for one event class. |
| `listenAny(listenerToken)` | Registers a listener for every event. |
| `subscribe(subscriberToken)` | Lets an `EventSubscriber` register multiple listeners. |
| `dispatch(event)` | Runs listeners in order; returning `false` stops propagation. |
| `ShouldQueue` | Marks a listener with `shouldQueue: true` for the optional queue adapter. |
| `dispatcherToken` | Resolves the configured `Dispatcher`; `useDispatcher(event)` is auto-imported in Nitro. |
| `eventListenerRegistryToken` | Registers boot-time listener definitions shared by request and worker dispatchers. |
| `EventFake` | Records events and provides `assertDispatched`, `assertNotDispatched` and `reset`. |

Application providers that register listeners during boot should resolve `eventListenerRegistryToken`; an `EventSubscriber` can receive that registry directly from the provider. `dispatcher.listen()`, `listenAny()`, and `subscribe()` remain local to the current request or worker dispatcher and never leak registrations into sibling scopes.

```ts
import { EventFake } from '@nuxt-laravelize/events/testing'

const events = new EventFake()
await events.dispatch(new UserRegistered('user_1'))
events.assertDispatched(UserRegistered, event => event.userId === 'user_1')
```

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#events). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/events-queue`](../events-queue/README.md), [`@nuxt-laravelize/queue`](../queue/README.md).
