# @nuxt-laravelize/dead-letter-operations

Optional, fail-closed Nuxt operations console for `@nuxt-laravelize/dead-letter`. It is disabled by default and is never included in the Laravelize preset.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/dead-letter-operations'],
  laravelizeDeadLetterOperations: {
    enabled: true,
    allowedOrigins: ['https://operations.example.com'],
    pagePath: '/operations/dead-letters',
    apiPath: '/api/operations/dead-letters',
    pageSize: 25,
    errorSummaries: false,
  },
})
```

The application must register adapters in an application service provider during boot by resolving `deadLetterAdapterRegistryToken`. This package registers no adapter and no permissive authorization ability. Register all required abilities in the central authorization registry: `dead-letters.list`, `dead-letters.view`, `dead-letters.view-payload`, `dead-letters.view-error-summary`, `dead-letters.retry`, `dead-letters.discard`, and `dead-letters.retry-inbox` for reliability inbox retries. Policies receive frozen `{ source }` context for listing and frozen `{ key }` context for item operations. Missing abilities deny access.

Payload retrieval is a separate request and is never SSR-rendered. Mutations require exact Origin, JSON POST, `X-Laravelize-Operations: 1`, revision fencing, confirmation, and a client operation ID. There are no bulk endpoints. Tenant hints are not exposed.

Authorization receives frozen context arguments: list checks receive the validated source and item checks receive the exact dead-letter key. Missing abilities deny access. Bootstrap capabilities are global hints only; detail responses carry key-specific capabilities and every endpoint authorizes again. If a mutation response is lost or otherwise ambiguous, the console retains the exact request and operation ID without automatically retrying it. Operators must choose between refreshing, retrying that same operation, or explicitly abandoning it before confirming a new operation.

Origins must be exact canonical HTTPS origins; HTTP is accepted only for loopback development/test origins. Keep this global operator interface behind application authentication and network controls.

[Español](./README.es.md)
