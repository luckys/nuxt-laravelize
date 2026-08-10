# `@luckys_luis/nuxt-laravelize-broadcasting-pusher`

[English](./README.md) | Espanol

Adapter opcional de servidor para Pusher Channels

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-broadcasting-pusher @luckys_luis/nuxt-laravelize-broadcasting
```

## Uso especifico del package


### Envia broadcasts mediante Pusher Channels

Este es solo un adapter de servidor. Conserva el secret de la aplicacion en configuracion privada, inyecta el broadcaster en el modulo base y configura las suscripciones del navegador por separado.

```ts
import { PusherBroadcaster } from '@luckys_luis/nuxt-laravelize-broadcasting-pusher'
import { broadcasterToken } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

container.instance(broadcasterToken, new PusherBroadcaster({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
}))
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |

## Broadcasting

`@luckys_luis/nuxt-laravelize-broadcasting` forma parte del preset y conecta eventos `ShouldBroadcast` con canales publicos, privados o de presencia. Cada evento debe implementar `broadcastWith()` explicitamente; nunca se reflejan sus propiedades, evitando filtrar payloads por accidente. Registra autorizaciones privadas y de presencia mediante el registro `useBroadcastChannels(event)`. El preset falla cerrado por defecto; el driver acotado en memoria se habilita explicitamente solo para desarrollo o tests.

```ts
import { PrivateChannel } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

class OrderUpdated {
  constructor(readonly orderId: string, readonly internalNote: string) {}
  broadcastOn() { return new PrivateChannel(`orders.${this.orderId}`) }
  broadcastAs() { return 'order.updated' }
  broadcastWith() { return { orderId: this.orderId } }
}

useBroadcastChannels(event).channel('orders.{orderId}', (user, { orderId }) => userCanView(user, orderId))
```

`@luckys_luis/nuxt-laravelize-broadcasting-pusher` es un **adapter de servidor** opt-in. Inyecta `PusherBroadcaster` mediante `broadcasterToken` y guarda las credenciales en runtime config privado. No incluye ni instala cliente WebSocket para navegador ni Laravel Echo; las suscripciones cliente se eligen y configuran por separado.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#broadcasting). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-broadcasting`](../broadcasting/README.es.md).
