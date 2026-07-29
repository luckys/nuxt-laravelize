# @nuxt-laravelize/queue-middleware

Opt-in `WithoutOverlapping` and `RateLimited` middleware for `@nuxt-laravelize/queue`.

Register each middleware explicitly on the shared `JobRunner`:

```ts
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'

const overlap = new WithoutOverlapping(cache, {
  namespace: 'billing:production',
  key: (job, scope) => {
    const context = scope.make(executionContextToken).snapshot()
    if (!context.tenantId) throw new Error('Tenant context is required')
    return `tenant:${context.tenantId}:invoice:${String(job.payload.invoiceId)}`
  },
  expiresAfterSeconds: 120,
  releaseAfterMilliseconds: 1000,
})

runner.use('invoice-overlap', overlap.handle)
```

Namespaces and logical keys must be bounded identifiers and must include trusted tenant scope where applicable. They are SHA-256 hashed before entering cache keys or errors; never include recipient addresses, tokens, or other secrets. A distributed owner-atomic cache is required by default in every environment, and `RateLimited` additionally requires the atomic fixed-window capability. Local development can opt into process-local coordination with `requireDistributed: false`.

Blocked jobs are released back to the configured queue without consuming their ordinary failure-attempt budget, up to the bounded `maxReleases` policy. `WithoutOverlapping` renews and owner-conditionally releases its lease, but cache expiry and infrastructure failover are not fencing; make external side effects idempotent.
