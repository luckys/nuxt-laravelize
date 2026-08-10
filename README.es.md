# Nuxt Laravelize

[English](./README.md) | Espanol

Nuxt Laravelize es un monorepo pnpm de paquetes enfocados `@luckys_luis/nuxt-laravelize*` para arquitectura de servidor inspirada en Laravel sobre Nuxt `>=4.3 <5`. Instala el preset para obtener el stack completo o selecciona solo las capacidades que necesita tu aplicacion.

## Paquetes

| Paquete | Proposito |
|---|---|
| `@luckys_luis/nuxt-laravelize-audit` | Auditoria append-only segura enriquecida por el contexto de ejecucion |
| `@luckys_luis/nuxt-laravelize-authorization` | Habilidades y politicas centralizadas con principal por scope |
| `@luckys_luis/nuxt-laravelize-authorization-queue` | Autorizacion opt-in de abilities por intento con recarga confiable del principal |
| `@luckys_luis/nuxt-laravelize-audit-drizzle` | Stores opcionales para PostgreSQL, SQLite y Turso/libSQL |
| `@luckys_luis/nuxt-laravelize-ai-sdk` | Conexiones IA nombradas opt-in, agentes tipados, streaming y testing |
| `@luckys_luis/nuxt-laravelize-agent-sdk` | API opt-in neutral para invocar, despachar, observar y probar agentes |
| `@luckys_luis/nuxt-laravelize-agents-cloudflare` | Adapter Cloudflare Agents 0.17.x con identidad y APIs nativas |
| `@luckys_luis/nuxt-laravelize-agents-flue` | Adapter Flue beta.9 para conversaciones, workflows y offsets opacos |
| `@luckys_luis/nuxt-laravelize-broadcasting` | Broadcasting de servidor para canales publicos, privados y de presencia |
| `@luckys_luis/nuxt-laravelize-broadcasting-pusher` | Adapter opcional de servidor para Pusher Channels |
| `@luckys_luis/nuxt-laravelize-cache` | Contrato cache portable, operaciones TTL, locks atomicos, contadores, memoizacion y driver en memoria |
| `@luckys_luis/nuxt-laravelize-cache-redis` | Adapter opcional Node-only para Redis/Valkey (no incluido en el preset) |
| `@luckys_luis/nuxt-laravelize-console` | Comandos tipados con DI, contexto por ejecucion y fakes de testing |
| `@luckys_luis/nuxt-laravelize-core` | Contenedor, tokens, providers, lifecycle y logging |
| `@luckys_luis/nuxt-laravelize-execution-context` | Identidad inmutable, correlacion confiable y logging contextual |
| `@luckys_luis/nuxt-laravelize-execution-context-queue` | Propagacion transparente del contexto por colas |
| `@luckys_luis/nuxt-laravelize-encryption` | Cifrado AES-256-GCM, binding por proposito y rotacion de claves |
| `@luckys_luis/nuxt-laravelize-events` | Eventos y listeners sincronicos |
| `@luckys_luis/nuxt-laravelize-filesystem` | Discos portables, almacenamiento en memoria y adapter local Node confinado al root |
| `@luckys_luis/nuxt-laravelize-filesystem-cloudflare` | Adapter filesystem opcional y nativo del binding R2, sin AWS SDK |
| `@luckys_luis/nuxt-laravelize-filesystem-aws` | Adapter filesystem opcional para S3 con AWS SDK, compatible con la API S3 de R2 |
| `@luckys_luis/nuxt-laravelize-filesystem-aws-redis` | Store Redis/Valkey compartido para confirmaciones S3 resistentes a reinicios |
| `@luckys_luis/nuxt-laravelize-queue` | Contratos de cola portables, jobs, ejecucion por scope y driver en memoria |
| `@luckys_luis/nuxt-laravelize-queue-bullmq` | Driver BullMQ y worker persistente, solo para Node |
| `@luckys_luis/nuxt-laravelize-queue-middleware` | Locks anti-overlap, rate limits y throttling de excepciones por ventana fija |
| `@luckys_luis/nuxt-laravelize-rate-limiter` | Rate limiting de ventana fija sobre cache y middleware Nitro |
| `@luckys_luis/nuxt-laravelize-reliability` | Outbox at-least-once e inbox idempotente independientes del framework |
| `@luckys_luis/nuxt-laravelize-reliability-drizzle` | Stores durables opcionales para PostgreSQL, SQLite y Turso |
| `@luckys_luis/nuxt-laravelize-dead-letter` | Contratos portables para gestionar mensajes fallidos por origen |
| `@luckys_luis/nuxt-laravelize-dead-letter-operations` | Dashboard dead-letter opcional y fail-closed (fuera del preset) |
| `@luckys_luis/nuxt-laravelize-reliability-queue` | Bridge Nuxt de mensajes Inbox/Outbox durables a jobs registrados |
| `@luckys_luis/nuxt-laravelize-routes` | Helpers de URL tipados generados desde declaraciones explicitas |
| `@luckys_luis/nuxt-laravelize-events-queue` | Integracion de listeners encolados entre eventos y colas |
| `@luckys_luis/nuxt-laravelize-mail` | Mailables, mail manager y transports |
| `@luckys_luis/nuxt-laravelize-migrations` | Runner transaccional neutral al ORM con checksums y comandos console |
| `@luckys_luis/nuxt-laravelize-migrations-drizzle` | Backends PostgreSQL/SQLite y fuentes agregadas de migraciones |
| `@luckys_luis/nuxt-laravelize-notifications` | Canales, routing bajo demanda y eventos de lifecycle de entrega |
| `@luckys_luis/nuxt-laravelize-notifications-broadcast` | Notificaciones realtime tenant-fenced mediante el broadcaster configurado |
| `@luckys_luis/nuxt-laravelize-notifications-database` | Notificaciones persistentes tenant-fenced con estado leido/no leido |
| `@luckys_luis/nuxt-laravelize-notifications-database-drizzle` | Stores durables PostgreSQL, SQLite y Turso para notificaciones database |
| `@luckys_luis/nuxt-laravelize-notifications-mail` | Canal mail opt-in con destinos validados |
| `@luckys_luis/nuxt-laravelize-notifications-queue` | Entrega encolada versionada con recarga del destinatario |
| `@luckys_luis/nuxt-laravelize-notifications-webhook` | Entrega durable tenant-fenced mediante webhooks firmados |
| `@luckys_luis/nuxt-laravelize-observability` | Base no-op neutral, spans HTTP seguros, metricas y fake de testing |
| `@luckys_luis/nuxt-laravelize-observability-otel` | Adapter OpenTelemetry API opcional; SDK/exporters pertenecen a la aplicacion |
| `@luckys_luis/nuxt-laravelize-observability-queue` | Propagacion W3C acotada y telemetria semantica para jobs |
| `@luckys_luis/nuxt-laravelize-pennant` | Feature flags por scope con definiciones lazy, valores ricos y stores portables |
| `@luckys_luis/nuxt-laravelize-scout` | Contratos de busqueda portables, motores nombrados, queries fluidas e indexacion por lotes |
| `@luckys_luis/nuxt-laravelize-scout-drizzle` | Motores Scout para PostgreSQL, SQLite y Turso/libSQL mediante clientes compatibles con Drizzle |
| `@luckys_luis/nuxt-laravelize-http` | Cliente HTTP nativo de Nuxt, requests, middleware, URLs firmadas, resources, paginacion y autorizacion |
| `@luckys_luis/nuxt-laravelize-hashing` | Hashing PBKDF2 versionado y deteccion de rehash |
| `@luckys_luis/nuxt-laravelize-database` | Factories y seeders independientes del ORM |
| `@luckys_luis/nuxt-laravelize-database-drizzle` | Adapters explicitos de transacciones Drizzle sync y async |
| `@luckys_luis/nuxt-laravelize-database-queue` | Dispatch explicito best-effort a queue despues de confirmar un commit de base de datos |
| `@luckys_luis/nuxt-laravelize-idempotency` | Idempotencia HTTP con leases, conflictos de fingerprint y replay |
| `@luckys_luis/nuxt-laravelize-idempotency-drizzle` | Stores durables de idempotencia para PostgreSQL, SQLite y Turso |
| `@luckys_luis/nuxt-laravelize-testing` | Test harness agregado y fakes |
| `@luckys_luis/nuxt-laravelize-validation` | Validacion Standard Schema, resultados tipados y error bags |
| `@luckys_luis/nuxt-laravelize-scheduler` | Schedules independientes del framework y adapter Nitro 3 explicito |
| `@luckys_luis/nuxt-laravelize-scheduler-nuxt` | Scheduler opt-in para Nuxt 4/Nitro 2 con politicas y triggers de provider |
| `@luckys_luis/nuxt-laravelize-webhooks` | Webhooks salientes firmados y entrantes idempotentes, solo para Node |
| `@luckys_luis/nuxt-laravelize-workflows` | Workflows lineales persistidos con resolucion exacta de versiones string, formato seguro, recovery y compensacion saga |
| `@luckys_luis/nuxt-laravelize-workflows-drizzle` | Stores durables de workflows para PostgreSQL, SQLite y Turso |
| `@luckys_luis/nuxt-laravelize-workflows-reliability` | Wake-ups transaccionales solo-ID con preflight de definicion exacta mediante el outbox durable |
| `@luckys_luis/nuxt-laravelize-workflows-queue` | Scheduling solo-ID con preflight de definicion exacta y reconciliacion desde el store |
| `@luckys_luis/nuxt-laravelize` | Preset conveniente con integracion de `nuxt-i18n-micro` |

## Instalacion

### Preset Nuxt completo

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
import Laravelize from '@luckys_luis/nuxt-laravelize'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'es', iso: 'es-ES', dir: 'ltr' }],
    defaultLocale: 'es',
    translationDir: 'locales',
  },
})
```

El preset activa cache, core, database, encryption, events, feature flags, filesystem, hashing, queued listeners, HTTP, mail, notifications, rate limiting, Scout con su driver en memoria, validation, la cola portable y el bridge reliability-queue. Activa `nuxt-i18n-micro` solo cuando hay locales utilizables configurados. No liga ningun store Inbox u Outbox volatil en produccion: la aplicacion debe proporcionar stores durables. Las traducciones usan la API nativa de Nuxt `$t()` y diccionarios JSON en lugar de `__()` al estilo Laravel; Nitro usa `useServerLocalization(event)` o `createServerLocalization(locale)` sin event. Webhooks sigue siendo opt-in; el preset tampoco instala BullMQ, `reliability-drizzle`, adapters filesystem cloud, adapters de base de datos para Scout ni activa el scheduler.

Las rutas tipadas generadas desde declaraciones explicitas tambien estan incluidas en el preset.

```vue
<template>
  <p>{{ $t('welcome', { name: 'Ada' }) }}</p>
</template>
```

### Features granulares

Instala y declara solo los modulos Nuxt que uses:

```bash
pnpm add @luckys_luis/nuxt-laravelize-events @luckys_luis/nuxt-laravelize-http
```

```ts
export default defineNuxtConfig({
  modules: [
    '@luckys_luis/nuxt-laravelize-events',
    '@luckys_luis/nuxt-laravelize-http',
  ],
})
```

Los modulos de features instalan y activan `@luckys_luis/nuxt-laravelize-core` transitivamente. Agrega adapters por separado cuando sean necesarios:

```bash
pnpm add @luckys_luis/nuxt-laravelize-queue @luckys_luis/nuxt-laravelize-queue-bullmq
pnpm add @luckys_luis/nuxt-laravelize-events @luckys_luis/nuxt-laravelize-queue @luckys_luis/nuxt-laravelize-events-queue
pnpm add @luckys_luis/nuxt-laravelize-scout @luckys_luis/nuxt-laravelize-scout-drizzle drizzle-orm
pnpm add @luckys_luis/nuxt-laravelize-audit @luckys_luis/nuxt-laravelize-audit-drizzle drizzle-orm
pnpm add @luckys_luis/nuxt-laravelize-ai-sdk ai zod @ai-sdk/anthropic
pnpm add @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-webhooks
pnpm add @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-reliability-drizzle drizzle-orm
pnpm add @luckys_luis/nuxt-laravelize-database @luckys_luis/nuxt-laravelize-database-drizzle drizzle-orm
pnpm add @luckys_luis/nuxt-laravelize-database @luckys_luis/nuxt-laravelize-queue @luckys_luis/nuxt-laravelize-database-queue
pnpm add @luckys_luis/nuxt-laravelize-idempotency
pnpm add @luckys_luis/nuxt-laravelize-workflows
pnpm add @luckys_luis/nuxt-laravelize-idempotency @luckys_luis/nuxt-laravelize-idempotency-drizzle drizzle-orm
pnpm add @luckys_luis/nuxt-laravelize-workflows @luckys_luis/nuxt-laravelize-workflows-drizzle drizzle-orm
pnpm add @luckys_luis/nuxt-laravelize-workflows-reliability @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-database
pnpm add @luckys_luis/nuxt-laravelize-workflows @luckys_luis/nuxt-laravelize-workflows-queue @luckys_luis/nuxt-laravelize-queue
pnpm add @luckys_luis/nuxt-laravelize-filesystem @luckys_luis/nuxt-laravelize-filesystem-cloudflare
pnpm add @luckys_luis/nuxt-laravelize-filesystem @luckys_luis/nuxt-laravelize-filesystem-aws
pnpm add -D @luckys_luis/nuxt-laravelize-testing
```

## Entrypoints publicos

La raiz de cada paquete es el entrypoint del modulo Nuxt salvo que se indique lo contrario. El codigo de aplicacion debe usar estos subpaths publicos en lugar de internals del paquete.

| Paquete | Entrypoints de runtime y adapters | Entrypoint de testing |
|---|---|---|
| `@luckys_luis/nuxt-laravelize-audit` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-audit-drizzle` | Raiz del paquete, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-ai-sdk` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-agent-sdk` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-agents-cloudflare` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-agents-flue` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-database-drizzle` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-idempotency` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-idempotency-drizzle` | Raiz, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-workflows` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-workflows-drizzle` | Raiz, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-workflows-reliability` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-workflows-queue` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-cache` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-cache-redis` | raiz del paquete | — |
| `@luckys_luis/nuxt-laravelize-console` | raiz del paquete, `/node` | `/testing` |
| `@luckys_luis/nuxt-laravelize-core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `@luckys_luis/nuxt-laravelize-authorization-queue` | Modulo Nuxt, `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-execution-context` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-execution-context-queue` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-encryption` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-events` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-filesystem` | `/runtime`, `/node` | `/testing` |
| `@luckys_luis/nuxt-laravelize-filesystem-cloudflare` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-filesystem-aws` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-queue` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-queue-bullmq` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-rate-limiter` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-reliability` | Raiz del paquete | `/testing` |
| `@luckys_luis/nuxt-laravelize-dead-letter` | Raiz del paquete | `/testing` |
| `@luckys_luis/nuxt-laravelize-dead-letter-operations` | Modulo Nuxt | `/runtime`, `/runtime/server` |
| `@luckys_luis/nuxt-laravelize-reliability-drizzle` | Raiz del paquete, `/postgres`, `/sqlite`, `/turso` | - |
| `@luckys_luis/nuxt-laravelize-reliability-queue` | Raiz del paquete, `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-events-queue` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-mail` | `/runtime`, `/node` | `/testing` |
| `@luckys_luis/nuxt-laravelize-migrations` | raiz del paquete, `/console` | `/testing` |
| `@luckys_luis/nuxt-laravelize-migrations-drizzle` | raiz, `/postgres`, `/sqlite`, `/sources` | `/testing` |
| `@luckys_luis/nuxt-laravelize-notifications` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-observability` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-observability-otel` | Raiz, `/runtime/server` | - |
| `@luckys_luis/nuxt-laravelize-observability-queue` | Raiz | - |
| `@luckys_luis/nuxt-laravelize-pennant` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-scout` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-scout-drizzle` | Raiz del paquete, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-http` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-hashing` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-database` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-database-queue` | Raiz del paquete | - |
| `@luckys_luis/nuxt-laravelize-testing` | Raiz del paquete | Raiz del paquete |
| `@luckys_luis/nuxt-laravelize-validation` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-scheduler` | Raiz del paquete, `/nitro3` | - |
| `@luckys_luis/nuxt-laravelize-scheduler-nuxt` | Modulo Nuxt, `/runtime`, `/adapters`, `/compiler`, `/cache-lock` | - |
| `@luckys_luis/nuxt-laravelize-webhooks` | Raiz del paquete | `/testing` |
| `@luckys_luis/nuxt-laravelize` | Raiz del paquete | - |

Ejemplos:

```ts
import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize-testing'
import { NodemailerMailer } from '@luckys_luis/nuxt-laravelize-mail/node'
```

## Limite del scheduler

`@luckys_luis/nuxt-laravelize-scheduler` es independiente del framework y no forma parte de `@luckys_luis/nuxt-laravelize`. Para Nuxt 4 usa el modulo opt-in `@luckys_luis/nuxt-laravelize-scheduler-nuxt`: compila declaraciones explicitas como tasks del Nitro 2 gestionado por Nuxt sin reemplazarlo. Sus wrappers aplican mantenimiento, overlap, one-server, queue y lifecycle mediante un scope runtime de la aplicacion. Los locks Redis/Valkey se exponen en `/cache-lock`.

El adapter separado `/nitro3` apunta exactamente a `nitro@3.0.260610-beta`. No instales Nitro 3 en una aplicacion Nuxt 4. Usa `/nitro3` solo en una aplicacion Nitro 3 explicita que cumpla su version peer.

## Desarrollo

```bash
pnpm install
pnpm build:packages   # construye todos los paquetes del workspace
pnpm test:packages    # ejecuta los tests de los paquetes
pnpm test:integration:postgres # prueba atomicidad workflow/outbox contra PostgreSQL
pnpm typecheck        # comprueba tipos en la raiz y los paquetes
pnpm lint             # ejecuta el lint del monorepo
pnpm pack:test        # construye tarballs y ejecuta smoke tests
pnpm dev              # prepara e inicia el playground Nuxt
```

Los releases usan Changesets:

```bash
pnpm changeset
pnpm version-packages
pnpm release:packages
```

Consulta [Migracion a paquetes modulares](./docs/migration-to-modular-packages.es.md) al actualizar una aplicacion anterior.

## Documentacion

- [Guia de modulos y API](./docs/modules.es.md): instalacion, APIs publicas y ejemplos para cada paquete.
- [Guia de modulos y API en ingles](./docs/modules.md): la misma referencia en ingles.
- Cada directorio bajo [`packages/`](./packages) incluye un [`README.md`](./packages/core/README.md) detallado y un [`README.es.md`](./packages/core/README.es.md) con ejemplos del package, entrypoints publicos, limites y packages relacionados.
- [Guia de migracion](./docs/migration-to-modular-packages.es.md): reemplazos para la facade legacy eliminada.
- [Roadmap de candidatas](./docs/roadmap.es.md): capacidades inspiradas en Laravel, prioridades, limites y criterios de graduacion.

## Licencia

MIT
