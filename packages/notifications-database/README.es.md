# `@luckys_luis/nuxt-laravelize-notifications-database`

[English](./README.md) | Espanol

Notificaciones persistentes tenant-fenced con estado leido/no leido

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-notifications-database
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-notifications-database'],
})
```


## Uso especifico del package


### Guarda y lee notificaciones database

Persiste solo JSON acotado y versionado y deja que la ruta del destinatario defina el aislamiento de tenant. El helper server ofrece paginacion por cursor y mutaciones de lectura; en produccion reemplaza el store de memoria por el adapter Drizzle.

```ts
import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['database'] as const }
  databaseType() { return 'invoice.paid' }
  databaseVersion() { return 1 }
  toDatabase() { return { invoiceId: 'invoice-1' } }
}

await notifications.send(recipient, new InvoicePaid())
const page = await useDatabaseNotifications(event).list({ recipient, limit: 20 })
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |

## Notifications

`@luckys_luis/nuxt-laravelize-notifications` enruta notificaciones por canales nombrados. El paquete base solo registra log y no instala mail ni queue. `useNotifications(event)` se autoimporta en Nitro.

```ts
import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['log'] as const }
  toLog() { return 'Invoice inv_1 was paid' }
}

const user = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : 'user_1',
}
await notifications.send(user, new InvoicePaid())
```

| API | Proposito |
|---|---|
| `DefaultNotificationManager.register()` | Registra un `NotificationChannel` personalizado. |
| `send()` / `sendNow()` | Envia a uno o varios notifiables mediante `via()`. |
| `route(channel, address)` | Inicia un `PendingNotification`; encadena `.route()` y termina con `.notify()`. |
| `LogChannel.send()` | Registra `notification.toLog()` o `toArray()`. |
| `notificationManagerToken` | Resuelve el manager configurado. |
| `NotificationFake` | Guarda notificaciones y ofrece assertions con predicado, conteo, negativas y reset. |
| `NotificationDelivered` | Observa una invocacion de canal completada. |
| `NotificationDeliveryFailed` | Observa un intento de canal rechazado o abortado. |

```ts
await notifications
  .route('log', 'user_1')
  .notify(new InvoicePaid())
```

`NotificationFake.assertSentTo()` acepta un predicado opcional con la notificacion tipada y los canales seleccionados por `via()`. Los tests tambien pueden usar `assertSentToTimes()`, `assertSentTimes()`, `assertNotSentTo()`, `assertCount()`, `assertNothingSent()` y `reset()`. El fake registra la intencion sin invocar canales ni emitir eventos de lifecycle.

Cuando `@luckys_luis/nuxt-laravelize-events` tambien esta registrado, el manager despacha eventos de lifecycle acotados por privacidad alrededor de intentos de entrega. Listeners confiables pueden acceder explicitamente a `notifiable`, `notification` y al `error` de fallo, que no son enumerables; la serializacion generica solo expone canal, tipo de evento, el flag `aborted` de los fallos y la metadata copiada `locale`, `tenantId`, `idempotencyKey` y `occurredAt`. Los eventos no implementan contrato durable ni payload encolable, y los fallos de listeners se registran con metadata segura y se aislan del resultado original del canal. Entre observers sigue aplicando el orden normal del dispatcher: un error o retorno `false` detiene los listeners posteriores de ese evento.

`NotificationDelivered` significa que el metodo del canal termino: se acepto una escritura database o append al outbox webhook, o retorno una llamada al provider mail/broadcast. No demuestra recepcion final ni entrega HTTP del webhook. `NotificationDeliveryFailed` describe un intento de entrega, incluida una señal ya abortada antes de invocar el canal, no el agotamiento de retries. Destinatarios ausentes, canales deshabilitados, payloads queued invalidos y tenant mismatches rechazados antes del manager no emiten estos eventos. Crashes y ejecucion at-least-once pueden omitir o duplicar observaciones, por lo que listeners con efectos deben deduplicar durablemente por tenant, idempotency key, canal y tipo de evento. No uses estos eventos best-effort como unico ledger de auditoria; `NotificationFake` no los emite.

Instala `@luckys_luis/nuxt-laravelize-notifications-mail` para registrar el canal `mail` opt-in. La notificacion implementa `toMail()`, pero el destino procede exclusivamente de `routeNotificationFor('mail')`; el contenido no puede reemplazarlo. El canal acepta una direccion simple por entrada, rechaza inyeccion de headers/listas y excesos de recursos, y propaga locale, abort signal e idempotency key al mailer configurado.

Instala `@luckys_luis/nuxt-laravelize-notifications-database` para registrar el canal `database` opt-in. Las notificaciones declaran `databaseType()`, `databaseVersion()` y JSON acotado mediante `toDatabase()`; los destinatarios exponen una route opaca `{ type, id, tenantId? }`. El tenant debe coincidir con execution context confiable. `useDatabaseNotifications(event)` ofrece listado por cursor y operaciones tenant-fenced `markRead()` / `markUnread()`. Desarrollo puede usar memoria acotada, mientras produccion exige un store durable como `@luckys_luis/nuxt-laravelize-notifications-database-drizzle`. Los retries idempotentes suprimen contenido identico y rechazan reutilizaciones conflictivas.

Instala `@luckys_luis/nuxt-laravelize-notifications-broadcast` para registrar el canal `broadcast` opt-in. Las notificaciones declaran `broadcastType()`, `broadcastVersion()` y JSON acotado mediante `toBroadcast()`; los destinatarios exponen una route opaca `{ type, id, tenantId? }`. El paquete deriva un canal privado determinista desde el tenant confiable y el destinatario, y emite el evento fijo `notification.created` con `{ id, type, version, data, locale? }`. El contenido no puede reemplazar el destino ni el evento. Usa `broadcastNotificationChannelName()` para autorizacion y suscripcion en browser, y configura por separado un adapter de servidor como `@luckys_luis/nuxt-laravelize-broadcasting-pusher`. La entrega sigue siendo at-least-once en el limite del proveedor; los clientes deben deduplicar por `id`. Este paquete no aloja WebSockets ni instala un cliente browser.

Instala `@luckys_luis/nuxt-laravelize-notifications-webhook` para registrar el canal `webhook` opt-in y exclusivo de Node. Las notificaciones implementan `webhookType()`, `webhookVersion()` y JSON acotado mediante `toWebhook()`, mientras el destinatario expone solo `{ endpointId, tenantId? }`. Liga `webhookNotificationOutboxStoreToken` a un outbox durable compartido y `webhookNotificationEndpointResolverToken` a un resolver confiable que consulta tenant e ID juntos. El contenido no puede seleccionar URLs, headers ni claves; el resolver devuelve una URL HTTPS sin query y un `secretId` opaco, y debe demostrar ownership del tenant confiable. Los replays de queue conservan ID y fecha entre inbox y outbox. Ejecuta `OutgoingWebhookProcessor` por separado y resuelve claves por `context.tenantId` y `secretId`; exige deduplicacion en el receptor, revoca claves al desactivar endpoints ya publicados y usa egress fijado o allowlisted porque validar DNS no elimina por completo el rebinding.

`@luckys_luis/nuxt-laravelize-notifications-queue` expone `QueuedNotificationDispatcher`, registries explicitos de codecs y resolvers con type/version, y `QueuedNotificationJob` versionado. No serializa routes, direcciones ni objetos `Notifiable`: el worker recarga destinatario, preferencias, locale, canales y tenant confiable antes de entregar un solo canal. Destinatarios ausentes o canales desactivados se omiten; payloads/versiones invalidos y tenant mismatch son terminales. Una notificacion puede implementar `withDelay(notifiable)` y devolver delays por canal en milisegundos enteros entre 0 y 86.400.000; el plan completo de destinatarios/canales se valida antes de publicar su primer job y los delays se aplican como metadata de queue. Omitir un canal conserva el delay por defecto del backend, mientras un `0` explicito lo reemplaza con disponibilidad inmediata. La entrega directa sigue siendo inmediata. Produccion exige queue e `InboxStore` durables; usa outbox cuando enqueue deba confirmar junto con estado de dominio. Un inbox completado suprime duplicados confirmados, pero el proveedor externo determina si el efecto final es idempotente. Su backoff de queue de un segundo coincide con el retry por defecto del inbox para no agotar intentos mientras un claim fallido aun no esta disponible. Los eventos de lifecycle conservan el delivery ID y fecha originales de queue, pero siguen siendo por intento y no durables.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#notifications). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-notifications-database-drizzle`](../notifications-database-drizzle/README.es.md), [`@luckys_luis/nuxt-laravelize-notifications`](../notifications/README.es.md).
