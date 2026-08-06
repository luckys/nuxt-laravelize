# `@nuxt-laravelize/agents-cloudflare`

[English](./README.md) | Espanol

Adapter Cloudflare Agents 0.17.x con identidad y APIs nativas

## Instalacion

```bash
pnpm add @nuxt-laravelize/agents-cloudflare @nuxt-laravelize/agent-sdk agents
```

## Uso especifico del package


### Conecta Cloudflare Agents

Este adapter conserva la identidad de la clase Agent y de la instancia Durable Object de Cloudflare. Cada llamada debe aportar `instanceId`; el adapter expone invoke, dispatch y observacion de eventos, pero no offsets reanudables.

```ts
import { CloudflareAgentRuntime } from '@nuxt-laravelize/agents-cloudflare'

const runtime = new CloudflareAgentRuntime({
  host: process.env.CLOUDFLARE_AGENT_HOST,
})

// Registra este runtime en AgentRuntimeRegistry como "cloudflare".
const result = await runtime.invoke({
  name: 'support-agent',
  instanceId: 'conversation-42',
  input: { message: 'Hola' },
})
console.log(result.result)
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./native` | Entrypoint publico de este package. |

## Agent SDK

`@nuxt-laravelize/agent-sdk` es una API comun opt-in separada para runtimes de agentes con estado. Registra runtimes nombrados en el contenedor existente y expone `useAgentRuntime(event)`, definiciones tipadas con `defineAgent()`, `invoke` sincrono, receipts de `dispatch` asincrono y streams `observe` iterables. Resultados, receipts, eventos, offsets y clientes conservan escapes `native`. Las capacidades distinguen streams de eventos, conversaciones y estado JSON, sin fingir que son el mismo modelo.

`@nuxt-laravelize/agents-cloudflare` usa RPC callable de Cloudflare Agents 0.17.x y conserva clase e identidad Durable Object. `@nuxt-laravelize/agents-flue` separa conversaciones de agentes y runs de workflows con paquetes `1.0.0-beta.9` fijados; sus offsets siguen opacos. Ninguno de los tres paquetes forma parte del preset. Guarda credenciales en runtime config privado y autoriza identidades antes de invocar.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#agent-sdk). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/agent-sdk`](../agent-sdk/README.es.md).
