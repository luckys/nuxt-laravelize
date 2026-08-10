# `@luckys_luis/nuxt-laravelize-events`

[English](./README.md) | Espanol

Eventos y listeners sincronicos

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-events
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-events'],
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

## Events

`@luckys_luis/nuxt-laravelize-events` despacha eventos de forma sincrona. Las definiciones de listeners registradas durante boot se comparten con dispatchers de requests y workers, mientras las instancias y dependencias de cada listener se resuelven desde el scope actual.

```bash
pnpm add @luckys_luis/nuxt-laravelize-events
```

```ts
import { createContainer, createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { InMemoryDispatcher, type Listener } from '@luckys_luis/nuxt-laravelize-events/runtime'

class UserRegistered {
  constructor(readonly userId: string) {}
  toPayload() { return [this.userId] }
}

const listenerToken = createToken<Listener<UserRegistered>>('listeners.welcome-user')
const container = createContainer()
container.singleton(listenerToken, () => ({
  handle: async event => console.log(`Welcome ${event.userId}`),
}))

const events = new InMemoryDispatcher(container)
events.listen(UserRegistered, listenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Proposito |
|---|---|
| `listen(Event, listenerToken)` | Registra un listener para una clase de evento. |
| `listenAny(listenerToken)` | Registra un listener para todos los eventos. |
| `subscribe(subscriberToken)` | Permite que un `EventSubscriber` registre varios listeners. |
| `dispatch(event)` | Ejecuta listeners en orden; devolver `false` detiene la propagacion. |
| `ShouldQueue` | Marca un listener con `shouldQueue: true` para el adapter de cola opcional. |
| `dispatcherToken` | Resuelve el `Dispatcher`; `useDispatcher(event)` se autoimporta en Nitro. |
| `eventListenerRegistryToken` | Registra definiciones de listeners de boot compartidas por dispatchers de requests y workers. |
| `EventFake` | Guarda eventos y ofrece `assertDispatched`, `assertNotDispatched` y `reset`. |

Los providers de aplicacion que registran listeners durante boot deben resolver `eventListenerRegistryToken`; un `EventSubscriber` puede recibir ese registry directamente desde el provider. `dispatcher.listen()`, `listenAny()` y `subscribe()` permanecen locales al dispatcher del request o worker actual y nunca filtran registros a scopes hermanos.

```ts
import { EventFake } from '@luckys_luis/nuxt-laravelize-events/testing'

const events = new EventFake()
await events.dispatch(new UserRegistered('user_1'))
events.assertDispatched(UserRegistered, event => event.userId === 'user_1')
```

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#events). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-events-queue`](../events-queue/README.es.md), [`@luckys_luis/nuxt-laravelize-queue`](../queue/README.es.md).
