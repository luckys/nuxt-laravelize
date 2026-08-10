# `@luckys_luis/nuxt-laravelize-webhooks`

[English](./README.md) | Espanol

Webhooks salientes firmados y entrantes idempotentes, solo para Node

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-webhooks
```

## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Reliability y webhooks

`@luckys_luis/nuxt-laravelize-reliability` proporciona envelopes JSON-safe versionados, procesamiento outbox con leases y deduplicacion inbox. El preset incluye `@luckys_luis/nuxt-laravelize-reliability-queue` para registrar handlers fiables y `ReliableMessageJob`, pero no liga stores volatiles en produccion. Cada aplicacion debe ligar stores Inbox y Outbox durables y compartidos; `reliability-drizzle` es opcional. Webhooks sigue siendo opt-in. La entrega es **at least once**: reintentos, expiracion del lease, crashes y ambiguedad del acknowledgement (el efecto se confirmo pero se perdio su confirmacion) pueden repetir mensajes, asi que cada handler debe ser idempotente.

La gestion dead-letter es opt-in mediante `@luckys_luis/nuxt-laravelize-dead-letter`; el preset no instala adaptadores administrativos. La aplicacion debe autorizar listar/ver/payload/resumen-de-error/reintentar/descartar y exigir un permiso reforzado para inbox. Payload, resumenes de error y pista de tenant son opt-in y nunca autorizan. Las capacidades omitidas del adapter se deniegan. Reliability admite reintentos programados y descarte; BullMQ solo reintento inmediato. Reintentar inbox puede repetir efectos. Los recibos son metadatos acotados de idempotencia/auditoria, no historial completo. La evidencia activa se conserva por defecto. El fencing BullMQ es optimista; su adapter lista snapshots acotados de hasta 1000 jobs fallidos retenidos y rechaza fuentes mayores, que requieren una cola o retencion mas estrecha. No hay acciones masivas.

Instala `@luckys_luis/nuxt-laravelize-dead-letter-operations` por separado para el dashboard opcional. Esta desactivado por defecto y ausente del preset. Al activarlo debes definir al menos un `allowedOrigins` canonico exacto, paths literales no solapados, adapters desde un provider de la aplicacion y las abilities dead-letter centrales. La API fija autoriza cada endpoint, expone payload solo en su endpoint dedicado, nunca expone pistas de tenant, protege mutaciones JSON con CSRF y revision, y devuelve 503 sin adapters. Consulta el README del paquete.

```bash
pnpm add @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-webhooks
# Adapter Drizzle durable opcional:
pnpm add @luckys_luis/nuxt-laravelize-reliability-drizzle drizzle-orm
```

El snapshot del execution context del envelope solo es procedencia de correlacion. **NO DEBE** autorizar tenant, actor, rol ni recurso. Reautentica y reautoriza contra estado actual y confiable dentro del consumer.

```ts
import { createEnvelope } from '@luckys_luis/nuxt-laravelize-reliability'
import { DrizzlePostgresReliabilityStore } from '@luckys_luis/nuxt-laravelize-reliability-drizzle/postgres'

const store = new DrizzlePostgresReliabilityStore(db)
const envelope = createEnvelope({
  type: 'invoice.paid.v1',
  payload: { invoiceId: 'inv_1' },
})

await db.transaction(async (tx) => {
  await markInvoicePaid(tx, 'inv_1')
  await store.appendWith(tx, envelope, {
    availableAt: new Date(Date.now() + 60_000).toISOString(),
  })
})
```

`availableAt` es el primer instante elegible para claim y usa `occurredAt` por defecto; agendar nunca cambia cuando ocurrio el evento. Ambos valores requieren timestamps ISO canonicos. Repetir un append con el mismo ID, envelope normalizado y disponibilidad es idempotente. Reutilizar un ID con contenido o disponibilidad diferente lanza `OutboxMessageConflictError` en vez de descartar silenciosamente un mensaje.

La escritura de negocio y `appendWith(tx, envelope, options)` **deben usar la misma transaccion y conexion de base de datos**. Agregar antes o despues reintroduce el dual-write gap y puede perder un evento o publicar estado revertido. Aplica la migracion base seguida por la migracion de append availability del dialecto. El schedule inmutable permanece estable mientras la disponibilidad mutable avanza durante reintentos. El store en memoria de `/testing` es acotado, volatil y solo sirve para tests/desarrollo; produccion requiere store durable compartido, IDs de owner estables, leases/reintentos acotados, heartbeat/renovacion del lease para trabajo que pueda superarlo, monitorizacion de mensajes dead y operaciones de retencion/reconciliacion. Drizzle sigue siendo opcional.

Aplica la migracion de tiempo terminal del dialecto (`0004` PostgreSQL o `0005` SQLite/Turso) y ejecuta pasadas acotadas con `store.prune({ namespace: 'outbox', completedBefore, states: ['delivered'], types: ['laravelize.workflow.wake.v1'], limit: 500 })`. La retencion usa `terminal_at` autoritativo, nunca el tiempo del envelope ni de elegibilidad; filas terminales legacy permanecen null hasta un backfill explicito del operador. Las filas dead requieren seleccion explicita y normalmente deben conservarse como evidencia. El pruning acorta la deduplicacion durable por ID, por lo que la retencion debe superar clock skew y la ventana maxima de replay.

Ejecuta la entrega outbox como proceso supervisado. Su modulo de configuracion exporta un `OutboxWorker`; SIGINT/SIGTERM detienen la entrada, drenan trabajo en curso y cierran recursos. Usa `--once` para una pasada operativa, tambien desde un scheduler; nunca ejecutes `run()` desde el scheduler.

```bash
pnpm exec outbox-work --config ./outbox-worker.config.js
pnpm exec outbox-work --once --config ./outbox-worker.config.js
pnpm exec webhook-work --config ./webhook-worker.config.js
```

`@luckys_luis/nuxt-laravelize-webhooks` ofrece `OutgoingWebhookProcessor`, verificacion HMAC del body raw y `WebhookInboxReceiver`. Su transport es **solo para Node** porque usa DNS, crypto, buffers y fetch de servidor de Node. Resuelve secrets de firma al entregar; el outbox solo guarda `secretId`. Los constructores de produccion exigen stores outbox/inbox durables.

```ts
import { OutgoingWebhookProcessor, createWebhookEnvelope } from '@luckys_luis/nuxt-laravelize-webhooks'

await store.append(createWebhookEnvelope({
  url: 'https://hooks.example.com/orders',
  secretId: 'customer-42-current',
  body: { orderId: 'order_1' },
}))

const webhooks = new OutgoingWebhookProcessor(store, {
  owner: 'webhooks-worker-1',
  resolveSecret: secrets.resolve,
  production: true,
})
await webhooks.runOnce()
```

Las URLs salientes exigen HTTPS por puerto 443, rechazan credenciales y direcciones privadas/reservadas, desactivan redirects y limitan timeouts. Los transports personalizados deben conservar esas restricciones de redirect, timeout, DNS/IP y TLS. El riesgo SSRF se reduce, no se elimina: la validacion DNS y la conexion posterior no estan fijadas atomicamente, dejando un residual DNS-rebinding/TOCTOU. Para destinos no confiables, exige un proxy egress con allowlist o pinning de direccion a nivel de conexion, ademas de politica de red saliente. Verifica firmas entrantes contra los bytes raw exactos, limita la tolerancia temporal, autentica/autoriza ownership del endpoint por separado y conserva la deduplicacion inbox al menos durante la ventana de reintentos del sender.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#reliability-y-webhooks). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-reliability`](../reliability/README.es.md), [`@luckys_luis/nuxt-laravelize-notifications-webhook`](../notifications-webhook/README.es.md).
