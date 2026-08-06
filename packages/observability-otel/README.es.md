# `@nuxt-laravelize/observability-otel`

[English](./README.md) | Espanol

Adapter OpenTelemetry API opcional; SDK/exporters pertenecen a la aplicacion

## Instalacion

```bash
pnpm add @nuxt-laravelize/observability-otel
```

## Uso especifico del package


### Conecta OpenTelemetry sin aduenarse del SDK

El adapter consume la API de OpenTelemetry y los providers configurados por la aplicacion. No instala un SDK global ni exporters; pasa provider, propagator y hooks de flush/shutdown explicitamente cuando haga falta.

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

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |

## Observabilidad y OpenTelemetry

`@nuxt-laravelize/observability` se incluye en el preset como base no-op sin coste. Sus contratos runtime no dependen de H3. Los providers de la aplicación pueden sobrescribir `observabilityToken` si se registran después de los providers del módulo. `@nuxt-laravelize/observability-otel` y `@nuxt-laravelize/observability-queue` son opt-in. El adapter OTel usa solo `@opentelemetry/api` en runtime y nunca instala globals, SDK ni exporters.

Los consumidores de cola crean spans raíz por defecto. Activa `trustTraceContext: true` solo para carriers de confianza. Los metadatos persisten únicamente `traceparent`; `tracestate` requiere `propagateTracestate: true` y baggage nunca se persiste. Los callbacks terminales de fallo no son spans de proceso. Si también se instala execution-context, observabilidad sustituye solo la correlación trace/span y conserva la identidad y procedencia de ejecución del worker.

La confianza del trace HTTP entrante está desactivada por defecto y baggage siempre se descarta. Las integraciones no capturan payloads, bodies, URLs/query, secretos, headers arbitrarios, IPs, mensajes/stacks de error ni IDs de actor/tenant/workflow/mensaje/job como labels. Los IDs no se capturan por defecto. Jobs y colas requieren allowlists explícitas o se convierten en `other`.

Los hooks Nitro inician y terminan spans. El token de observabilidad del request enlaza los servicios Laravelize, `useObservability(event)`, `observe()` y la inyección del productor de colas con ese span de servidor. Esto no es ALS global del handler: la autoinstrumentación externa que evita el token no queda enlazada por este mecanismo.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#observabilidad-y-opentelemetry). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/observability`](../observability/README.es.md).
