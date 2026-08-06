# `@nuxt-laravelize/ai-sdk`

[English](./README.md) | Espanol

Conexiones IA nombradas opt-in, agentes tipados, streaming y testing

## Instalacion

```bash
pnpm add @nuxt-laravelize/ai-sdk ai zod @ai-sdk/anthropic
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/ai-sdk'],
})
```


## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## AI SDK

`@nuxt-laravelize/ai-sdk` es un modulo de servidor opt-in construido sobre AI SDK 7. Proporciona conexiones de modelos nombradas, `useAi(event)`, agentes reutilizables tipados, streaming de texto, tools, structured output, comprobaciones explicitas de capacidades y `AiFake`. No forma parte del preset y requiere Node.js 22 o superior.

```bash
pnpm add @nuxt-laravelize/ai-sdk ai zod @ai-sdk/anthropic
```

Registra los providers explicitamente en `server/providers`; el modulo nunca importa paquetes de providers ni lee sus credenciales:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { AiConnectionRegistry, aiConnectionsToken } from '@nuxt-laravelize/ai-sdk/runtime'

export default class AiConnectionsServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(aiConnectionsToken, () => {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      return new AiConnectionRegistry().register('anthropic', {
        defaultModel: 'claude-sonnet-4-6',
        model: model => anthropic(model),
      })
    })
  }
}
```

Genera con `await useAi(event).generate({ prompt })`, o devuelve `useAi(event).stream({ prompt }).toTextStreamResponse()` desde Nitro. `defineAgent<Input, Result>()` agrupa instrucciones, tools, schema de salida, seleccion de modelo y construccion del prompt sin asumir persistencia. Cloudflare Workers AI se conecta mediante su provider compatible con AI SDK. Flue y Cloudflare Agents son runtimes de agentes, no providers de modelos, y quedan fuera de esta API.

Las opciones especificas del provider pasan sin cambios. Las capacidades se consideran habilitadas salvo que la conexion las desactive. El paquete no registra, audita, cachea ni persiste prompts o respuestas automaticamente porque pueden contener credenciales, datos personales o informacion regulada.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#ai-sdk). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/agent-sdk`](../agent-sdk/README.es.md).
