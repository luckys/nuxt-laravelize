# `@nuxt-laravelize/events-queue`

[English](./README.md) | Espanol

Integracion de listeners encolados entre eventos y colas

## Instalacion

```bash
pnpm add @nuxt-laravelize/events-queue
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/events-queue'],
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

## Listeners encolados

`@nuxt-laravelize/events-queue` conecta listeners marcados con `shouldQueue: true` a una cola sin acoplar los paquetes base.

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue @nuxt-laravelize/events-queue
```

```ts
class WelcomeUserListener implements Listener<UserRegistered> {
  readonly shouldQueue = true as const
  async handle(event: UserRegistered) { /* send welcome message */ }
}

events.listen(UserRegistered, welcomeUserListenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Proposito |
|---|---|
| `EventRegistry.register()` | Registra constructores serializables por nombre. El adapter lo llama automaticamente. |
| `EventRegistry.make(name, args)` | Recrea un evento registrado desde argumentos de constructor. |
| `QueueListenerAdapter.enqueue()` | Encola eventos que implementan `toPayload()` como `ListenerJob`; devuelve `false` para los demas. |
| `ListenerJob` | Resuelve y ejecuta el listener original dentro del worker. |
| `eventRegistryToken` | Resuelve el registro compartido. |

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#listeners-encolados). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/events`](../events/README.es.md), [`@nuxt-laravelize/queue`](../queue/README.es.md).
