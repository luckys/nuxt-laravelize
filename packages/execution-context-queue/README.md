# `@luckys_luis/nuxt-laravelize-execution-context-queue`

[Espanol](./README.es.md) | English

Execution context propagation across Laravelize queues

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-execution-context-queue
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-execution-context-queue'],
})
```


## Package-specific usage


### Propagate execution context into a job

Install the bridge at the producer and worker boundaries. The snapshot carries correlation provenance only; it must never authorize the actor or tenant encoded in it.

```ts
import { runWithExecutionContext, useExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

await runWithExecutionContext(useExecutionContext(event), () =>
  useQueue(event).push(new SendReport({ reportId: 'report-1' })),
)
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |

## Execution Context

`@luckys_luis/nuxt-laravelize-execution-context` gives every Nitro request an immutable, validated, JSON-safe context. `useExecutionContext(event)` returns the request-scoped value. Incoming correlation IDs are accepted only when `trustIncomingCorrelationHeader` is explicitly enabled and valid; actor and tenant headers are never trusted. Attributes are limited to 16 string entries of 256 characters. The optional canonical BCP 47 `locale` is bounded to 35 characters, resolved by server localization for HTTP requests, preserved by `create`, `derive`, `enrich`, and queue propagation, and recorded as a first-class audit field.

Use `snapshot()` for transport, `derive()` for child work, authenticated `enrich()` for actor/tenant, and `withExecutionContext()` for sanitized logs. A transported snapshot is correlation provenance and **MUST NOT** be used to authorize its actor or tenant. HTTP handlers pass their request context explicitly when dispatching: `runWithExecutionContext(useExecutionContext(event), () => queue.push(job))`. The queue bridge preserves correlation, creates a worker execution ID, and sets causation to the producer execution ID; the same registered `JobSerializer` must be passed to persistent queue adapters.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#execution-context). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.md), [`@luckys_luis/nuxt-laravelize-queue`](../queue/README.md).
