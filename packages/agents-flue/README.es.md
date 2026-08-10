# `@luckys_luis/nuxt-laravelize-agents-flue`

[English](./README.md) | Espanol

Adapter Flue beta.9 para conversaciones, workflows y offsets opacos

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-agents-flue @luckys_luis/nuxt-laravelize-agent-sdk @flue/runtime@1.0.0-beta.9 @flue/sdk@1.0.0-beta.9
```

## Uso especifico del package


### Conecta agentes y workflows de Flue

El adapter de Flue mapea llamadas de agentes a conversaciones persistentes y llamadas de workflows a runs durables. Las conversaciones de agentes requieren un ID de instancia; las observaciones de workflows pueden reanudarse con un offset opaco de Flue.

```ts
import { FlueAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-flue'

const runtime = new FlueAgentRuntime({
  baseUrl: process.env.FLUE_BASE_URL,
  token: process.env.FLUE_TOKEN,
})

const result = await runtime.invoke({
  name: 'support-agent',
  kind: 'agent',
  instanceId: 'conversation-42',
  input: 'Explica el estado de la factura.',
})
console.log(result.result)
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |

## Agent SDK

`@luckys_luis/nuxt-laravelize-agent-sdk` es una API comun opt-in separada para runtimes de agentes con estado. Registra runtimes nombrados en el contenedor existente y expone `useAgentRuntime(event)`, definiciones tipadas con `defineAgent()`, `invoke` sincrono, receipts de `dispatch` asincrono y streams `observe` iterables. Resultados, receipts, eventos, offsets y clientes conservan escapes `native`. Las capacidades distinguen streams de eventos, conversaciones y estado JSON, sin fingir que son el mismo modelo.

`@luckys_luis/nuxt-laravelize-agents-cloudflare` usa RPC callable de Cloudflare Agents 0.17.x y conserva clase e identidad Durable Object. `@luckys_luis/nuxt-laravelize-agents-flue` separa conversaciones de agentes y runs de workflows con paquetes `1.0.0-beta.9` fijados; sus offsets siguen opacos. Ninguno de los tres paquetes forma parte del preset. Guarda credenciales en runtime config privado y autoriza identidades antes de invocar.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#agent-sdk). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-agent-sdk`](../agent-sdk/README.es.md).
