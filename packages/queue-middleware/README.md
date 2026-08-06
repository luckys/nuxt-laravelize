# `@nuxt-laravelize/queue-middleware`

[Espanol](./README.es.md) | English

Portable overlap, rate-limit and exception-throttle middleware for Nuxt Laravelize queues

## Install

```bash
pnpm add @nuxt-laravelize/queue-middleware
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/queue-middleware'],
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

## Queue middleware

`@nuxt-laravelize/queue-middleware` provides opt-in `WithoutOverlapping`, `RateLimited`, and `ThrottlesExceptions` middleware. Register their stable `handle` functions on the shared `JobRunner`; all bypass their coordination logic during the failed phase and allow terminal `failed()` hooks to run. A blocked job is released with a bounded delay rather than reported as successful or consuming an ordinary failure retry. `InMemoryQueue` reschedules the same entry and BullMQ uses `moveToDelayed()` with its worker token. Queue observability records this as `released`, not `failed`.

```ts
import { cacheToken } from '@nuxt-laravelize/cache/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { RateLimited, ThrottlesExceptions, WithoutOverlapping } from '@nuxt-laravelize/queue-middleware/runtime'
import { jobRunnerToken } from '@nuxt-laravelize/queue/runtime'

const runner = container.make(jobRunnerToken)
const cache = container.make(cacheToken)

runner.use('invoice-overlap', new WithoutOverlapping(cache, {
  namespace: 'billing:production',
  key: (job, scope) => {
    const context = scope.make(executionContextToken).snapshot()
    if (!context.tenantId) throw new Error('Tenant context is required')
    return `tenant:${context.tenantId}:invoice:${String(job.payload.invoiceId)}`
  },
  expiresAfterSeconds: 120,
  releaseAfterMilliseconds: 1000,
}).handle)

runner.use('mail-provider-limit', new RateLimited(cache, {
  namespace: 'billing:production',
  key: 'provider:mail',
  maxAttempts: 100,
  decaySeconds: 60,
}).handle)

runner.use('mail-provider-exceptions', new ThrottlesExceptions(cache, {
  namespace: 'billing:production',
  key: 'provider:mail',
  maxExceptions: 5,
  decaySeconds: 300,
  backoffMilliseconds: 1000,
  when: error => error instanceof MailProviderUnavailableError,
}).handle)
```

Namespaces and logical keys accept only bounded identifiers, must include trusted tenant scope where applicable, and are hashed before cache storage or error reporting. Never derive them from addresses, tokens, or other secrets. A distributed owner-atomic cache is required by default in every environment, while `RateLimited` and `ThrottlesExceptions` additionally require atomic fixed-window operations; process-local development must opt in with `requireDistributed: false`. Releases do not consume ordinary failure attempts but are bounded by the adapter's job-global release count and each encountered `maxReleases` policy. `WithoutOverlapping` renews and owner-conditionally releases its lease, but expiry and cache failover are not fencing; keep external effects idempotent. `sync()` cannot reschedule a released job and therefore surfaces `JobReleasedError` to its caller.

`ThrottlesExceptions` counts eligible exceptions within one fixed window; it deliberately does not claim Laravel-style consecutive-failure semantics. Success does not clear the shared budget, avoiding a race where an overlapping success could erase another worker's failure. Eligible failures below `maxExceptions` release with `backoffMilliseconds`; the threshold-causing failure and later executions release for the cache-authoritative remainder of the window. The required `when` predicate must narrowly select trusted provider failures. Put validation and authorization outside the throttle, include trusted server-side tenant scope in keys where identities overlap, and never derive arbitrary keys from payload input. Lower `JobRunner` order values are outer middleware: register authorization with a lower order than the throttle so rejected jobs never enter its budget. `JobReleasedError` and `NonRetryableJobError` pass through without counting; a throwing predicate is conservatively counted with both errors preserved instead of leaving the breaker fail-open. A cache read failure prevents execution, while a recording failure produces ordinary-retryable `ExceptionThrottleRecordingError` instead of releasing an unrecorded exception; configure conservative queue attempts when provider protection must survive write-only cache outages. Release exhaustion retains the latest release cause for terminal diagnostics. These cause chains are trusted-server material and failure reporters must redact them before general logs, dead-letter summaries or client exposure. Redis records counts atomically with server time, but recording and queue release are not one transaction; crashes, acknowledgement ambiguity, failover and already-running jobs mean this is an operational circuit breaker, not an authorization boundary, strict request cap or exactly-once exception ledger. Defaults are a 600-second window, 1000 ms short backoff and 100 job-global releases. Apply per-tenant admission quotas and monitor delayed-job retention, especially when configuring long windows.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#queue-middleware). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/queue`](../queue/README.md), [`@nuxt-laravelize/cache`](../cache/README.md), [`@nuxt-laravelize/rate-limiter`](../rate-limiter/README.md).
