# F3: Events / Listeners — Design Spec

**Status:** Approved
**Date:** 2026-05-25
**Phase:** F3 (Events)
**Depends on:** F0 (container / providers)

## 1. Goal

Bring Laravel-style Events to `@luckys_luis/nuxt-laravelize`: a typed in-process pub/sub primitive that lets services dispatch named domain events and lets listeners react synchronously or as queued microtasks. The dispatcher integrates with the IoC container so listeners resolve their dependencies the same way controllers do.

## 2. Scope

**In scope (MVP — "Completo"):**
- `Dispatcher` interface + `InMemoryDispatcher` default impl.
- Plain class events (`class UserRegistered { constructor(public readonly userId: string) {} }`).
- Listener classes (`class extends Listener<E> { handle(event) {} }`) registered by token.
- `listen<E>(EventClass, token)` — type-safe per-event registration.
- `listenAny(token)` — wildcard listener that receives every dispatched event.
- `subscribe(token)` — registers an `EventSubscriber` whose `subscribe(dispatcher)` method is called immediately to wire multiple listens at once.
- `dispatch<E>(event)` — serial, fail-fast for non-queued listeners; `queueMicrotask` for queued.
- `ShouldQueue` marker via `static readonly shouldQueue = true` on the listener class.

**Out of scope (deferred):**
- Real distributed queues (Bull, Redis, SQS). The MVP's "queue" is just an in-process microtask.
- Pluggable queue driver interface.
- Wildcard string-pattern listeners (`'user.*'`) — only the all-event `listenAny` is supported.
- Event discovery (auto-scanning files for listeners) — explicit registration only.
- `ShouldBroadcast` / WebSocket broadcasting.
- Event replay or persistence.

## 3. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| MVP scope | "Completo": dispatch + listener + subscriber + queue + wildcard (via `listenAny`) |
| Event shape | Plain class (`class UserRegistered { ... }`) — no abstract base, no string tag |
| Event identity | Constructor reference: `dispatcher.listen(UserRegistered, token)` matched via `event.constructor === ctor` |
| Wildcards | Separate API `listenAny(token)` — no string patterns |
| Listener shape | Class with `handle(event): void \| Promise<void>` resolved via container |
| Dispatch semantics | Serial await, fail-fast for non-queued listeners |
| Queue strategy | `static readonly shouldQueue = true` marker + `queueMicrotask` (in-process, fire-and-forget, errors logged) |
| Subscriber | Class with `subscribe(dispatcher): void` — resolved from container, invoked immediately |

## 4. Architecture

New bounded context:

```
src/events/
├── Listener.ts               # Listener<E> + ShouldQueue interfaces
├── EventSubscriber.ts        # EventSubscriber interface
├── Dispatcher.ts             # Dispatcher interface + EventConstructor type
├── InMemoryDispatcher.ts     # concrete in-process implementation
├── DispatcherToken.ts        # dispatcherToken
└── index.ts                  # barrel
```

**No HTTP coupling.** F3 is independent of `src/http/`. Anything (controllers, providers, other listeners) can resolve the dispatcher and emit events. The handler pipeline does not interact with events directly.

**Pipeline (`dispatch`):**

```
dispatch(event)
  → bound = #bound.get(event.constructor) ?? []
  → all   = [...bound, ...#anyListeners]
  → for token of all:
        listener = container.make(token)
        if (listener.constructor.shouldQueue === true):
          queueMicrotask(() =>
            Promise.resolve(listener.handle(event))
              .catch(error => console.error('[laravelize.events] queued listener failed', error))
          )
        else:
          await listener.handle(event)
```

## 5. Components

### 5.1 `Listener.ts`

```ts
export interface Listener<E> {
  handle(event: E): void | Promise<void>
}

export interface ShouldQueue {
  readonly shouldQueue: true
}
```

`ShouldQueue` is a documentation hint. The runtime check inspects the constructor's static property: `(listener.constructor as { shouldQueue?: true }).shouldQueue === true`. A listener class declares it with `static readonly shouldQueue = true as const`.

### 5.2 `EventSubscriber.ts`

```ts
import type { Dispatcher } from './Dispatcher'

export interface EventSubscriber {
  subscribe(dispatcher: Dispatcher): void
}
```

### 5.3 `Dispatcher.ts`

```ts
import type { Token } from '../core/container/Token'

import type { EventSubscriber } from './EventSubscriber'
import type { Listener } from './Listener'

export type EventConstructor<E = unknown> = new (...args: never[]) => E

export interface Dispatcher {
  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void
  listenAny(listener: Token<Listener<unknown>>): void
  subscribe(subscriber: Token<EventSubscriber>): void
  dispatch<E>(event: E): Promise<void>
}
```

### 5.4 `InMemoryDispatcher.ts`

```ts
import type { Container } from '../core/container/Container'
import type { Token } from '../core/container/Token'

import type { Dispatcher, EventConstructor } from './Dispatcher'
import type { EventSubscriber } from './EventSubscriber'
import type { Listener } from './Listener'

export class InMemoryDispatcher implements Dispatcher {
  readonly #container: Container
  readonly #bound = new Map<EventConstructor, Token<Listener<unknown>>[]>()
  readonly #anyListeners: Token<Listener<unknown>>[] = []

  constructor(container: Container) {
    this.#container = container
  }

  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void {
    const current = this.#bound.get(event as EventConstructor) ?? []
    current.push(listener as unknown as Token<Listener<unknown>>)
    this.#bound.set(event as EventConstructor, current)
  }

  listenAny(listener: Token<Listener<unknown>>): void {
    this.#anyListeners.push(listener)
  }

  subscribe(subscriber: Token<EventSubscriber>): void {
    const instance = this.#container.make(subscriber)
    instance.subscribe(this)
  }

  async dispatch<E>(event: E): Promise<void> {
    const ctor = (event as object).constructor as EventConstructor
    const bound = this.#bound.get(ctor) ?? []
    const all = [...bound, ...this.#anyListeners]

    for (const token of all) {
      const listener = this.#container.make(token)
      const isQueued = (listener.constructor as { shouldQueue?: true }).shouldQueue === true
      if (isQueued) {
        queueMicrotask(() => {
          Promise.resolve(listener.handle(event)).catch((error) => {
            console.error('[laravelize.events] queued listener failed', error)
          })
        })
      }
      else {
        await listener.handle(event)
      }
    }
  }
}
```

(Project convention bans `else`; the real implementation will refactor the if/else into early-return or guarded sequencing. The spec preserves clarity.)

### 5.5 `DispatcherToken.ts`

```ts
import { createToken } from '../core/container/Token'

import type { Dispatcher } from './Dispatcher'

export const dispatcherToken = createToken<Dispatcher>('laravelize.dispatcher')
```

### 5.6 `index.ts` barrel

```ts
export type { Dispatcher, EventConstructor } from './Dispatcher'
export type { EventSubscriber } from './EventSubscriber'
export type { Listener, ShouldQueue } from './Listener'
export { InMemoryDispatcher } from './InMemoryDispatcher'
export { dispatcherToken } from './DispatcherToken'
```

### 5.7 Runtime auto-imports

Create `src/runtime/server/events/index.ts`:

```ts
export { InMemoryDispatcher } from '../../../events/InMemoryDispatcher'
export { dispatcherToken } from '../../../events/DispatcherToken'
```

Register this directory in `src/module.ts` via `addServerImportsDir`.

### 5.8 Main module re-exports

`src/module.ts` (or the root barrel that re-exports public surface) re-exports the same set from `events/index.ts` so consumers can `import { Dispatcher, dispatcherToken } from '@luckys_luis/nuxt-laravelize'`.

## 6. Errors and edge cases

| Case | Behavior |
| --- | --- |
| `dispatch` of an event with no listeners | No-op. Resolves immediately. |
| Non-queued listener throws (sync or async) | `dispatch` rejects with the same error. Later listeners do not run (fail-fast). |
| Queued listener throws | Caught in the microtask `.catch`. `console.error` logs. No effect on other listeners or on the request. |
| `subscribe()`'s subscriber throws during `.subscribe(dispatcher)` | Propagates. Registration in `boot` should be deterministic; a failure there indicates a configuration error. |
| `event.constructor` not registered | Only `listenAny` listeners run. |
| Same listener token registered twice | Executes twice (no dedup, mirrors Laravel). |
| `dispatch(plainObject)` (no class) | `event.constructor === Object`; only `listenAny` runs. Not a supported use case but does not crash. |
| Listener mutates `event` | Mutation is visible to subsequent listeners (reference semantics; intentional, mirrors Laravel). |
| Re-entrancy (listener emits new event) | Supported. Nested `dispatch` is independent. |
| Container fails to resolve a listener token | Throws from `container.make`; `dispatch` rejects. |

## 7. Testing strategy

TDD per task. Target: ~46 new tests, ~150 total.

### Unit — `test/events/InMemoryDispatcher.test.ts` (~40 tests)

Registration:
- `listen` registers a single listener; `dispatch` invokes it with the event.
- `dispatch` resolves the listener via the container.
- Multiple `listen` calls for the same event execute in registration order.
- `listen` for different events do not cross-fire.
- Same listener token registered twice executes twice.
- `dispatch` with no listeners is a silent no-op.

Sync / async:
- Sync `handle` is awaited.
- Async `handle` is awaited.
- Sync `throw` rejects `dispatch` with the same error.
- Async reject rejects `dispatch`.
- Fail-fast: throw in listener 2 prevents listener 3 from running.

`listenAny`:
- `listenAny` receives an event with no specific listeners.
- `listenAny` receives an event that also has specific listeners.
- `listenAny` runs after specific listeners.
- Two `listenAny` listeners run in registration order.

Queued (`ShouldQueue`):
- Listener with `static readonly shouldQueue = true` does not block `dispatch`.
- Queued listener executes after a microtask flush.
- Queued listener that throws logs `console.error` and does not affect other listeners.
- Queued listener that throws does not reject `dispatch`.
- Multiple queued listeners all execute.
- Mix: sync + queued — sync runs serial, queued is scheduled.

Subscriber:
- `subscribe` resolves the subscriber via the container.
- `subscribe` invokes `subscriber.subscribe(dispatcher)` exactly once.
- A subscriber that registers two `listen` calls causes both to fire on dispatch.
- Subscriber resolved with a container dependency works (e.g., subscriber that injects a logger).

Misc:
- `dispatch` passes the exact instance to `handle` (reference equality).
- Re-entrancy: a listener that dispatches a different event during its handler works.
- A listener that mutates the event before others run propagates mutation.
- Event class with a parent class matches only the exact constructor, not the parent.
- `EventConstructor` generic narrows the listener's `event` parameter at the type level.
- `container.make` failure during `dispatch` rejects with the container error.
- `listenAny` with zero listeners is harmless.
- `subscribe` of a subscriber that registers nothing is harmless.

### Integration — `test/integration/laravelize.test.ts` (~6 new tests)

1. Provider registers dispatcher + listener; an endpoint dispatches and the listener runs (verified via a shared probe in the container — e.g., an `EventProbe` service that counts events).
2. Endpoint with a queued listener — `$fetch` resolves before the queued listener finishes; a second `$fetch` reads the probe state and observes the queued effect (sleep / poll briefly to allow microtasks).
3. Subscriber registered in boot wires multiple listeners; `$fetch` to an endpoint triggers all of them.
4. `listenAny` registered in boot receives an event dispatched from an endpoint.
5. Listener with a transitive container dependency resolves correctly.
6. Non-queued listener that throws — endpoint responds 500 with the propagated error.

### Playground (no tests; real usage)

- `playground/server/events/UserRegistered.ts` — `class UserRegistered { constructor(public readonly userId: string) {} }`.
- `playground/server/listeners/SendWelcomeEmailListener.ts` — sync, logs `[welcome] sent to <id>`.
- `playground/server/listeners/LogUserRegistrationListener.ts` — `static readonly shouldQueue = true`, logs `[audit] registered <id>`.
- `playground/server/subscribers/UserSubscriber.ts` — registers both listeners for `UserRegistered`.
- `playground/server/providers/EventsProvider.ts` — registers dispatcher (singleton), listener tokens (transient), subscriber token; in `boot` calls `dispatcher.subscribe(userSubscriberToken)`.
- Update `playground/server/controllers/UserController.ts` to inject the dispatcher token and emit `new UserRegistered(id)` inside `store()`.
- Add a probe service (in-memory counter) the integration tests inspect.

## 8. Acceptance criteria

1. `Dispatcher`, `InMemoryDispatcher`, `Listener`, `ShouldQueue`, `EventSubscriber`, `EventConstructor`, `dispatcherToken` exported from `src/events/index.ts` and from the package's main barrel.
2. `InMemoryDispatcher` and `dispatcherToken` auto-importable in server scope.
3. `listen<E>` is type-safe: a listener registered for `UserRegistered` has `event: UserRegistered` inside its `handle`.
4. `listenAny(token)` works and runs after specific listeners.
5. `dispatch<E>` executes non-queued listeners serially, fail-fast.
6. Listeners marked with `static readonly shouldQueue = true` run via `queueMicrotask`; their errors are logged via `console.error` and do not propagate.
7. Subscribers registered via `dispatcher.subscribe(token)` are resolved from the container and their `subscribe(dispatcher)` is invoked exactly once.
8. The 104 pre-F3 tests remain green (no regression).
9. Approximately 46 new tests pass (target total: ~150 green).
10. Playground includes `UserRegistered` event, a sync listener, a queued listener, a subscriber, and an `EventsProvider`. Emitted from `UserController.store()`.
11. `pnpm lint`, `pnpm typecheck`, `pnpm prepack` are clean.

## 9. Out-of-scope (for a future spec)

- Pluggable queue driver interface (`Queue` abstraction, `BullQueueDriver`, etc.).
- Real distributed queue integration.
- Event broadcasting (`ShouldBroadcast`).
- Event discovery / auto-registration.
- String wildcard patterns (`'user.*'`).
- Event persistence / replay.
- Listener middleware (before/after hooks).
