# `@nuxt-laravelize/observability-otel`

[Espanol](./README.es.md) | English

OpenTelemetry API adapter for Nuxt Laravelize observability

## Install

```bash
pnpm add @nuxt-laravelize/observability-otel
```

## Package-specific usage


### Attach OpenTelemetry without owning the SDK

The adapter consumes the OpenTelemetry API and the providers already configured by the application. It does not install a global SDK or exporter; pass provider, propagator, flush, and shutdown hooks explicitly when needed.

```ts
import { OtelObservability } from '@nuxt-laravelize/observability-otel'
import { observabilityToken } from '@nuxt-laravelize/observability/runtime'

const observability = new OtelObservability({
  instrumentationName: 'orders-api',
  tracerProvider,
  meterProvider,
  propagator,
})
container.instance(observabilityToken, observability)

const span = observability.startSpan('invoice.load', { kind: 'internal' })
span.end()
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime/server` | Public entrypoint for this package. |

## Observability and OpenTelemetry

`@nuxt-laravelize/observability` is included in the preset as a zero-cost no-op foundation. Its runtime contracts do not depend on H3. Application providers may override `observabilityToken`; register the override after module providers. `@nuxt-laravelize/observability-otel` and `@nuxt-laravelize/observability-queue` remain opt-in. The OTel adapter uses only `@opentelemetry/api` at runtime and never installs globals, an SDK, or exporters.

Incoming HTTP trace trust is disabled by default. Baggage is always discarded. Built-in integrations never capture payloads, bodies, raw URLs/query, secrets, arbitrary headers, IPs, error messages/stacks, or actor/tenant/workflow/message/job IDs as metric labels. IDs are not captured by default. Metric dimensions are fixed; job and queue names require explicit allowlists and otherwise become `other`.

Queue consumers also start root spans by default. Set `trustTraceContext: true` only for trusted queue carriers when remote parenting is intended. Queue metadata persists only `traceparent`; `tracestate` requires `propagateTracestate: true`, and baggage is never persisted. Terminal job failure callbacks are not process spans. When execution-context propagation is installed too, observability replaces only trace/span correlation and preserves the worker execution identity and provenance.

Nitro lifecycle hooks reliably start and finish request spans. The request-scoped observability token binds Laravelize services, `useObservability(event)`, `observe()`, and queue producer injection to that server span. This is not global handler ALS: arbitrary external auto-instrumentation that bypasses the token is not parented by this mechanism.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#observability-and-opentelemetry). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/observability`](../observability/README.md).
