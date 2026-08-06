# `@nuxt-laravelize/core`

[Espanol](./README.es.md) | English

Framework-neutral container and provider lifecycle for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/core
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/core'],
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
| `./runtime/server` | Public entrypoint for this package. |
| `./kit` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Core

`@nuxt-laravelize/core` provides the dependency container, typed tokens, service providers, application lifecycle and logging. Feature modules install it automatically.

```bash
pnpm add @nuxt-laravelize/core
```

### Container and tokens

| API | Purpose |
|---|---|
| `createToken<T>(key)` | Creates a typed service identifier. |
| `createContainer()` | Creates an empty container. |
| `bind(token, factory)` | Registers a transient service. |
| `singleton(token, factory)` | Registers one shared instance. |
| `scoped(token, factory)` | Registers one instance per child scope. |
| `instance(token, value)` | Registers an existing value. |
| `make(token)` / `has(token)` | Resolves a service or checks its registration. |
| `createScope()` | Creates a request or operation scope. |
| `seal()` | Prevents further registrations. Nuxt seals after boot. |
| `dispose()` | Disposes this container. Dispose each child scope separately. |

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

interface Clock { now(): Date }
const clockToken = createToken<Clock>('app.clock')
const container = createContainer()

container.singleton(clockToken, () => ({ now: () => new Date() }))
container.seal()

const now = container.make(clockToken).now()
```

Implement `ServiceProvider.register()` for bindings and optional `boot()` for work that requires all providers to be registered.

```ts
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

export default class ClockServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(clockToken, () => ({ now: () => new Date() }))
  }
}
```

Register an application provider from a Nuxt module with `addLaravelizeProvider(nuxt, path, mode)` from `@nuxt-laravelize/core/kit`. In Nitro handlers, the auto-imports `useContainer(event)` and `useLogger(event)` resolve the current request scope.

### Logging

| API | Purpose |
|---|---|
| `ConsoleLogger` | Writes human-readable records to a console. |
| `StructuredLogger` | Writes structured JSON records. |
| `FileLogger` | Appends records to a file; use in Node runtimes. |
| `loggerFor(resolver)` | Resolves `loggerToken` or returns a warning-level console fallback. |
| `shouldEmit(level, minimum)` | Compares log levels using `LOG_LEVELS`. |
| `FakeLogger` | Records logs for assertions through `/testing`. |

```ts
import { ConsoleLogger } from '@nuxt-laravelize/core/runtime'

const logger = new ConsoleLogger({ threshold: 'info' })
logger.info('Invoice created', { invoiceId: 'inv_1' })
```

The lifecycle classes `LaravelizeApplication` and `Kernel`, container errors, logger contracts and option interfaces are exported for framework and adapter authors. Most applications use providers and the Nuxt runtime helpers instead.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#core). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/testing`](../testing/README.md), [`@nuxt-laravelize/execution-context`](../execution-context/README.md).
