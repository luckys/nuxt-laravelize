# `@luckys_luis/nuxt-laravelize-observability`

[English](./README.md) | Espanol

Base no-op neutral, spans HTTP seguros, metricas y fake de testing

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-observability
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-observability'],
})
```


## Uso especifico del package


### Instrumenta un request sin filtrar datos sensibles

El paquete base es una foundation no-op neutral al vendor. Reemplaza el token scoped por una implementacion de la aplicacion y conserva atributos acotados; la instrumentacion incluida excluye bodies, URLs raw, secrets e IDs de identidad.

```ts
import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'

const span = useObservability(event).startSpan('invoice.load', {
  kind: 'server',
  attributes: { 'app.operation': 'invoice.load' },
})
try {
  return await loadInvoice()
}
finally {
  span.end()
}
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Observabilidad y OpenTelemetry

`@luckys_luis/nuxt-laravelize-observability` se incluye en el preset como base no-op sin coste. Sus contratos runtime no dependen de H3. Los providers de la aplicación pueden sobrescribir `observabilityToken` si se registran después de los providers del módulo. `@luckys_luis/nuxt-laravelize-observability-otel` y `@luckys_luis/nuxt-laravelize-observability-queue` son opt-in. El adapter OTel usa solo `@opentelemetry/api` en runtime y nunca instala globals, SDK ni exporters.

Los consumidores de cola crean spans raíz por defecto. Activa `trustTraceContext: true` solo para carriers de confianza. Los metadatos persisten únicamente `traceparent`; `tracestate` requiere `propagateTracestate: true` y baggage nunca se persiste. Los callbacks terminales de fallo no son spans de proceso. Si también se instala execution-context, observabilidad sustituye solo la correlación trace/span y conserva la identidad y procedencia de ejecución del worker.

La confianza del trace HTTP entrante está desactivada por defecto y baggage siempre se descarta. Las integraciones no capturan payloads, bodies, URLs/query, secretos, headers arbitrarios, IPs, mensajes/stacks de error ni IDs de actor/tenant/workflow/mensaje/job como labels. Los IDs no se capturan por defecto. Jobs y colas requieren allowlists explícitas o se convierten en `other`.

Los hooks Nitro inician y terminan spans. El token de observabilidad del request enlaza los servicios Laravelize, `useObservability(event)`, `observe()` y la inyección del productor de colas con ese span de servidor. Esto no es ALS global del handler: la autoinstrumentación externa que evita el token no queda enlazada por este mecanismo.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#observabilidad-y-opentelemetry). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-observability-otel`](../observability-otel/README.es.md), [`@luckys_luis/nuxt-laravelize-observability-queue`](../observability-queue/README.es.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.es.md).
