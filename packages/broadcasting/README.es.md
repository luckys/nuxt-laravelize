# `@nuxt-laravelize/broadcasting`

[English](./README.md) | Espanol

Broadcasting de servidor para canales publicos, privados y de presencia

## Instalacion

```bash
pnpm add @nuxt-laravelize/broadcasting
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/broadcasting'],
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
| `./testing` | Entrypoint publico de este package. |

## Broadcasting

`@nuxt-laravelize/broadcasting` forma parte del preset y conecta eventos `ShouldBroadcast` con canales publicos, privados o de presencia. Cada evento debe implementar `broadcastWith()` explicitamente; nunca se reflejan sus propiedades, evitando filtrar payloads por accidente. Registra autorizaciones privadas y de presencia mediante el registro `useBroadcastChannels(event)`. El preset falla cerrado por defecto; el driver acotado en memoria se habilita explicitamente solo para desarrollo o tests.

```ts
import { PrivateChannel } from '@nuxt-laravelize/broadcasting/runtime'

class OrderUpdated {
  constructor(readonly orderId: string, readonly internalNote: string) {}
  broadcastOn() { return new PrivateChannel(`orders.${this.orderId}`) }
  broadcastAs() { return 'order.updated' }
  broadcastWith() { return { orderId: this.orderId } }
}

useBroadcastChannels(event).channel('orders.{orderId}', (user, { orderId }) => userCanView(user, orderId))
```

`@nuxt-laravelize/broadcasting-pusher` es un **adapter de servidor** opt-in. Inyecta `PusherBroadcaster` mediante `broadcasterToken` y guarda las credenciales en runtime config privado. No incluye ni instala cliente WebSocket para navegador ni Laravel Echo; las suscripciones cliente se eligen y configuran por separado.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#broadcasting). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/broadcasting-pusher`](../broadcasting-pusher/README.es.md), [`@nuxt-laravelize/notifications-broadcast`](../notifications-broadcast/README.es.md).
