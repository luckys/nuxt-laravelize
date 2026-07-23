# @nuxt-laravelize/observability

Vendor-neutral tracing and fixed metric contracts. The Nuxt module installs a singleton no-op provider, semantic HTTP spans, bounded shutdown, and `useObservability(event)`. Applications may override `observabilityToken` from a later application provider. Incoming W3C parenting is disabled by default; enable `laravelizeObservability.trustIncomingTraceContext` only behind a trusted edge. The request-scoped token binds Laravelize services, `useObservability(event)`, `observe()`, and queue producer injection to the HTTP server span. Nitro hooks do not establish global handler ALS, so arbitrary external auto-instrumentation that bypasses the token is not covered.

## Privacy and cardinality

| Never captured by the built-in integrations | Allowed bounded dimensions |
|---|---|
| Payloads, bodies, raw URLs/query, secrets, arbitrary headers, IPs, messages, stacks | HTTP method, route template, status class |
| Actor, tenant, workflow, message, request, or job IDs as metric labels | Explicitly allowlisted job and queue names, otherwise `other` |

IDs are not captured by default. Attributes are primitive only, names and counts are bounded, baggage is always dropped, and errors record only a sanitized type.

## Español

Contratos neutrales de tracing y métricas fijas. El módulo instala un proveedor no-op, spans HTTP semánticos, cierre acotado y `useObservability(event)`. Un provider de la aplicación registrado después puede sobrescribir `observabilityToken`. La confianza del contexto W3C entrante está desactivada por defecto. No se capturan payloads, bodies, URLs/query, secretos, headers arbitrarios, IPs, mensajes, stacks ni IDs; baggage siempre se descarta.
