# @nuxt-laravelize/execution-context

Immutable, JSON-safe execution identity for HTTP requests and application work.

```ts
const context = useExecutionContext(event)
context.snapshot()
```

Incoming correlation IDs are ignored by default. Explicitly enable trusted infrastructure headers:

```ts
export default defineNuxtConfig({
  laravelizeExecutionContext: {
    correlationHeader: 'x-correlation-id',
    trustIncomingCorrelationHeader: true,
  },
})
```

The portable `runtime` entry exports `ExecutionContext`, `ExecutionContextAccessor`, tokens and `withExecutionContext`. It has no H3 dependency. The logger helper always wins over caller-provided trusted fields; register it explicitly around your logger where desired. Server-side background dispatch from an HTTP handler can establish a bounded ambient context with `runWithExecutionContext(useExecutionContext(event), operation)`; request hooks never use unbounded `AsyncLocalStorage.enterWith`.
