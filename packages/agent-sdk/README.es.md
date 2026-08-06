# `@nuxt-laravelize/agent-sdk`

[English](./README.md) | Espanol

API opt-in neutral para invocar, despachar, observar y probar agentes

## Instalacion

```bash
pnpm add @nuxt-laravelize/agent-sdk
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/agent-sdk'],
})
```


## Uso especifico del package


### Define e invoca un agente neutral al runtime

Registra un runtime nombrado una sola vez y mantén el codigo de la aplicacion independiente de Cloudflare Agents, Flue o un fake de tests. `invoke`, `dispatch` y `observe` son capacidades separadas; compruebalas antes de elegir una operacion.

```ts
import { AgentSdkClient, defineAgent } from '@nuxt-laravelize/agent-sdk/runtime'

const soporte = defineAgent<{ question: string }, { answer: string }>({
  name: 'support',
  instanceId: 'conversation-42',
})

const client = new AgentSdkClient(runtimes, 'cloudflare')
const result = await soporte.invoke(client, { question: 'Como restablezco mi password?' })
console.log(result.result.answer)

const receipt = await soporte.dispatch(client, { question: 'Resume este ticket.' })
for await (const event of soporte.observe(client, { receipt })) {
  console.log(event.type, event.payload)
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

## Agent SDK

`@nuxt-laravelize/agent-sdk` es una API comun opt-in separada para runtimes de agentes con estado. Registra runtimes nombrados en el contenedor existente y expone `useAgentRuntime(event)`, definiciones tipadas con `defineAgent()`, `invoke` sincrono, receipts de `dispatch` asincrono y streams `observe` iterables. Resultados, receipts, eventos, offsets y clientes conservan escapes `native`. Las capacidades distinguen streams de eventos, conversaciones y estado JSON, sin fingir que son el mismo modelo.

`@nuxt-laravelize/agents-cloudflare` usa RPC callable de Cloudflare Agents 0.17.x y conserva clase e identidad Durable Object. `@nuxt-laravelize/agents-flue` separa conversaciones de agentes y runs de workflows con paquetes `1.0.0-beta.9` fijados; sus offsets siguen opacos. Ninguno de los tres paquetes forma parte del preset. Guarda credenciales en runtime config privado y autoriza identidades antes de invocar.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#agent-sdk). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/agents-cloudflare`](../agents-cloudflare/README.es.md), [`@nuxt-laravelize/agents-flue`](../agents-flue/README.es.md).
