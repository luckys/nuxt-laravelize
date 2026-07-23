# @nuxt-laravelize/observability-otel

Optional `@opentelemetry/api` adapter. It never installs an SDK, exporter, global provider, context manager, or global propagator. The application owns those resources and passes explicit providers/callbacks when desired.

```ts
container.singleton(observabilityToken, () => new OtelObservability({
  tracerProvider,
  meterProvider,
  propagator,
  forceFlush: () => sdk.forceFlush(),
  shutdown: () => sdk.shutdown(),
}))
```

Register this application provider after the observability module's default provider. Propagation accepts only `traceparent` and `tracestate`; baggage is disabled. `/ Español:` el adapter no configura globals ni SDK/exporters; la aplicación mantiene su ciclo de vida y registra el provider explícitamente después del provider no-op.
