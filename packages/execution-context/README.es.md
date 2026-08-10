# `@luckys_luis/nuxt-laravelize-execution-context`

[English](./README.md) | Espanol

Identidad inmutable, correlacion confiable y logging contextual

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-execution-context
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-execution-context'],
})
```


## Uso especifico del package


### Deriva y transporta un contexto de ejecucion

Los contextos son inmutables, acotados y seguros para JSON. Deriva el trabajo hijo para conservar correlacion y causacion; usa `enrich()` solo despues de autenticar actor y tenant desde la aplicacion.

```ts
import { useExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

const requestContext = useExecutionContext(event)
const jobContext = requestContext.derive({
  source: { type: 'queue', name: 'invoice-sync' },
})

await queue.push(job, { executionContext: jobContext.snapshot() })
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Contexto de ejecucion

`@luckys_luis/nuxt-laravelize-execution-context` asigna a cada request Nitro un contexto inmutable, validado y seguro para JSON. `useExecutionContext(event)` devuelve el valor del scope. Los IDs de correlacion entrantes solo se aceptan cuando `trustIncomingCorrelationHeader` esta habilitado explicitamente y son validos; nunca se confian headers de actor o tenant. Los atributos se limitan a 16 strings de 256 caracteres. El `locale` BCP 47 canonical opcional se limita a 35 caracteres, server localization lo resuelve para HTTP, `create`, `derive`, `enrich` y queue lo conservan, y audit lo registra como campo de primera clase.

Usa `snapshot()` para transporte, `derive()` para trabajo hijo, `enrich()` autenticado para actor/tenant y `withExecutionContext()` para logs saneados. Un snapshot transportado solo es procedencia de correlacion y **NO DEBE** autorizar actor o tenant. Los handlers HTTP pasan el contexto de request explicitamente al despachar: `runWithExecutionContext(useExecutionContext(event), () => queue.push(job))`. El bridge de colas conserva la correlacion, crea un execution ID del worker y asigna como causacion el execution ID productor; los adapters persistentes deben recibir el mismo `JobSerializer` registrado.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#contexto-de-ejecucion). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-execution-context-queue`](../execution-context-queue/README.es.md), [`@luckys_luis/nuxt-laravelize-observability`](../observability/README.es.md), [`@luckys_luis/nuxt-laravelize-audit`](../audit/README.es.md).
