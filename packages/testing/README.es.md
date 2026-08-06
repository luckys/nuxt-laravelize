# `@nuxt-laravelize/testing`

[English](./README.md) | Espanol

Test harness agregado y fakes

## Instalacion

```bash
pnpm add -D @nuxt-laravelize/testing
```

## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |

## Testing

`@nuxt-laravelize/testing` agrega los fakes oficiales y los monta en un contenedor sellado.

```bash
pnpm add -D @nuxt-laravelize/testing
```

```ts
import { mountLaravelize } from '@nuxt-laravelize/testing'

const app = mountLaravelize()
await app.cache.put('feature:user_1', true, 60)
await app.events.dispatch(new UserRegistered('user_1'))
await app.queue.push(new SendReport({ reportId: 'report_1' }))
await app.mail.send(new WelcomeMail('ada@example.com'))

app.events.assertDispatched(UserRegistered)
app.queue.assertPushed(SendReport)
app.mail.assertSent(WelcomeMail)
await app.cache.assertHas('feature:user_1')
```

`mountLaravelize()` devuelve `container`, `cache`, `encrypter`, `events`, `features`, `filesystem`, `hasher`, `queue`, `mail`, `notifications`, `rateLimiter` y `validator`. El paquete tambien reexporta `CacheFake`, `EventFake`, `FakeLogger`, `FilesystemFake`, `QueueFake`, `MailFake` y `NotificationFake` para tests enfocados.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#testing). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/core`](../core/README.es.md), [`@nuxt-laravelize/cache`](../cache/README.es.md), [`@nuxt-laravelize/queue`](../queue/README.es.md), [`@nuxt-laravelize/events`](../events/README.es.md).
