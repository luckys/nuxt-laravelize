# @nuxt-laravelize/queue-middleware

Opt-in `WithoutOverlapping`, `RateLimited`, and fixed-window `ThrottlesExceptions` middleware for `@nuxt-laravelize/queue`.

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

runner.use('mail-exceptions', new ThrottlesExceptions(cache, {
  namespace: 'billing:production',
  key: 'provider:mail',
  maxExceptions: 5,
  decaySeconds: 300,
  backoffMilliseconds: 1000,
  when: error => error instanceof MailProviderUnavailableError,
}).handle)
```

Namespaces and logical keys must be bounded identifiers and must include trusted tenant scope where applicable. They are SHA-256 hashed before entering cache keys or errors; never include recipient addresses, tokens, or other secrets. A distributed owner-atomic cache is required by default in every environment, and `RateLimited` and `ThrottlesExceptions` additionally require the atomic fixed-window capability. Local development can opt into process-local coordination with `requireDistributed: false`.

Blocked jobs are released back to the configured queue without consuming their ordinary failure-attempt budget, up to the bounded `maxReleases` policy. `WithoutOverlapping` renews and owner-conditionally releases its lease, but cache expiry and infrastructure failover are not fencing; make external side effects idempotent.

`ThrottlesExceptions` is a fixed-window exception budget, not a consecutive-failure streak: successful executions do not erase recorded exceptions. Eligible failures below the threshold use the short backoff; the threshold-causing failure and later executions wait for the cache-authoritative window remainder. Release signals and `NonRetryableJobError` are never counted. The required `when` predicate must select only intended provider failures; place authorization outside the throttle and include trusted tenant scope in keys where identities overlap. `JobRunner` executes lower order values as outer middleware, so register authorization with a lower order than the throttle to keep authorization errors outside its budget. A predicate failure is conservatively counted rather than leaving the breaker fail-open. Cache recording failures surface as ordinary-retryable `ExceptionThrottleRecordingError` instead of releasing unrecorded failures, so keep queue attempts conservative when downstream protection must survive write-only cache outages. Detailed error causes are for trusted diagnostics and must be redacted by failure reporters before general logs, dead-letter summaries, or client exposure. Cache state and queue release are not transactional, so this is an operational circuit breaker rather than a safety boundary or exact exception ledger. Apply admission quotas and delayed-queue retention monitoring, especially with long windows.

| Option | Default | Contract |
|---|---:|---|
| `maxExceptions` | required | Positive safe integer of eligible exceptions that opens the window. |
| `decaySeconds` | `600` | Fixed window, greater than zero and at most one day. |
| `backoffMilliseconds` | `1000` | Delay below the threshold, from 1 ms through one day. |
| `maxReleases` | `100` | Job-global delayed-release ceiling; other release middleware shares adapter accounting. |
| `when(error, job, scope, descriptor)` | required | Trusted sync/async classifier; throwing is counted fail-closed. |
| `requireDistributed` | `true` | Set `false` only for process-local development or tests. |
