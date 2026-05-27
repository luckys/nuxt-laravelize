# nuxt-laravelize

[English](./README.md) | Español

Módulo de Nuxt 4 que trae primitivas de arquitectura inspiradas en Laravel a Nuxt y Nitro: contenedor DI por request, providers auto-descubiertos, controllers single-action con validación, eventos, colas, mail, notificaciones, pagination, autorización con políticas, logging, i18n, seeding y testing helpers — todo bajo el patrón DDD estilo CodelyTV.

## El stack Laravelize

| Paquete | Rol |
|---|---|
| **[`@luckys_luis/nuxt-laravelize`](./)** *(este)* | Runtime — container DI, controllers, queues, mail, notifications, i18n, policies, seeders, factories, testing helpers. |
| [`@luckys_luis/nuxt-ddd-toolkit`](../nuxt-ddd-toolkit) | Toolchain — plugin ESLint con 12 reglas DDD, CLI scaffolding (`laravelize new:*`), presets, 15 skills IA con auto-link. |

> El paquete anterior `@luckys_luis/nuxt-laravelize-config` fue renombrado a `nuxt-ddd-toolkit` en la v0.2.0 y ahora es un stub deprecado.

## Tabla de contenido

- [Qué ofrece este módulo](#qué-ofrece-este-módulo)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Mapa de features](#mapa-de-features)
- [Composables (server)](#composables-server)
- [CLI (bins)](#cli-bins)
- [Testing helpers](#testing-helpers)
- [Desarrollo](#desarrollo)

## Qué ofrece este módulo

- Container DI (awilix) scoped por request + Tokens type-safe.
- Service Providers descubiertos por convención + registro programático.
- Controllers single-action con `defineLaravelizedHandler` y `FormRequest` (Zod / Valibot / Standard Schema).
- Resources (`Resource`, `ResourceCollection`, `PaginatedResourceCollection`).
- Eventos con `Dispatcher` + Listeners async/queued.
- Queue con drivers `memory` y `bullmq`, worker CLI (`laravelize-queue-work`).
- Authorization Gate + Policies (auto-discovered desde `server/policies/*.policy.ts`).
- Pagination (`SimplePaginator`, `LengthAwarePaginator`, `CursorPaginator`).
- Logging (`ConsoleLogger`, `StructuredLogger`, `FileLogger`) cableado en queue y events.
- Mail (`LogMailer`, `NodemailerMailer`, `ResendMailer`).
- Notifications con canales `mail`, `log`, `queue`.
- Localization (`DictionaryTranslator` con pluralización y fallback).
- Database: `Seeder` + `Factory<T>` + bin `laravelize-db-seed`.
- Testing helpers (`./testing` subpath): `mountLaravelize`, `FakeDispatcher`, `FakeQueue`, `FakeMailer`, `FakeNotificationManager`, `FakeLogger`.

## Instalación

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

Peer requeridos: `nuxt >= 4.0.0`, `h3 >= 1.0.0`.
Peer opcionales: `bullmq`, `ioredis`, `zod`, `valibot`, `drizzle-orm`, `nodemailer`, `resend`, `@faker-js/faker`.

## Inicio rápido

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize'],
  laravelize: {
    container: true,
    queue: { driver: 'memory' },
  },
})
```

```ts
// server/api/users/[id].get.ts
export default defineLaravelizedHandler({
  controller: FindUserController,
  request: FindUserRequest,
})
```

```ts
// server/contexts/identity/users/application/UserFinder/UserFinder.ts
export class UserFinder {
  constructor(private readonly users: UserRepository) {}
  async execute(input: { id: string }) {
    return this.users.find(new UserId(input.id))
  }
}
```

## Mapa de features

| Área | Symbols principales | Helper server |
|---|---|---|
| Container | `Container`, `Token`, `createToken` | `useContainer(event)` |
| Providers | `ServiceProvider`, `Kernel` | descubrimiento automático |
| Controllers | `defineLaravelizedHandler`, `FormRequest`, `Resource` | — |
| Events | `Dispatcher`, `Listener`, `EventSubscriber`, `dispatcherToken` | — |
| Queue | `Queue`, `InMemoryQueue`, `BullMQQueue`, `Job`, `QueueWorker`, `queueToken` | — |
| Pagination | `LengthAwarePaginator`, `CursorPaginator`, `SimplePaginator` | — |
| Auth | `Gate`, `Policy`, `PolicyRegistry`, `gateToken` | — |
| Logging | `Logger`, `ConsoleLogger`, `StructuredLogger`, `FileLogger`, `loggerToken` | `useLogger(event)` |
| Mail | `Mailable`, `Mailer`, `LogMailer`, `NodemailerMailer`, `ResendMailer`, `mailerToken` | `useMailer(event)` |
| Notifications | `Notification`, `Notifiable`, `MailChannel`, `LogChannel`, `QueueChannel`, `notificationManagerToken` | `useNotifier(event)` |
| i18n | `Translator`, `DictionaryTranslator`, `translatorToken` | `useTranslator(event)` |
| Seeding | `Seeder`, `SeederRegistry`, `discoverSeedersByConvention` | bin `laravelize-db-seed` |
| Factories | `Factory<T>`, `FactoryRegistry`, `builtInFaker` | — |

## Composables (server)

Todos auto-importados en server routes:

- `useContainer(event)` — container scoped por request.
- `useLogger(event)`, `useMailer(event)`, `useNotifier(event)`, `useTranslator(event)`.

## CLI (bins)

```bash
# Worker de colas
laravelize-queue-work --queue=default --concurrency=4 --config=laravelize.queue.config.ts

# Seeder
laravelize-db-seed --class=DemoInvoiceSeeder --config=laravelize.seed.config.ts
```

Para scaffolding (contextos, agregados, use cases…) instala `@luckys_luis/nuxt-laravelize-config` y usa `pnpm laravelize new:*`.

## Testing helpers

Subpath export `@luckys_luis/nuxt-laravelize/testing`:

```ts
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize/testing'

const harness = await mountLaravelize({
  fakes: { dispatcher: true, queue: true, mailer: true, notifications: true, logger: true },
})

await useCase.execute(...)

harness.dispatcher!.assertDispatched(InvoiceCreated, (e) => e.amount === 100)
harness.queue!.assertQueued(SendNotificationJob)
harness.mailer!.assertMailed(InvoicePaidMail)
harness.notifications!.assertSentTo(user, InvoicePaidNotification)
expect(harness.logger!.hasMessage('info', 'mail dispatched')).toBe(true)
```

## Comportamiento runtime

Cuando el container está activo, cada request Nitro recibe un container scoped en `event.context.laravelizeContainer`. Los providers descubiertos en `server/contexts/**/infrastructure/*ServiceProvider.ts` se registran y bootean automáticamente al boot.

## Desarrollo

```bash
pnpm install
pnpm dev:prepare
pnpm dev        # arranca playground
pnpm test       # vitest (342 tests)
pnpm typecheck  # vue-tsc --noEmit
pnpm lint
```

## Flujo de publicación

```bash
pnpm lint && pnpm test && pnpm typecheck
pnpm prepack
pnpm publish
```
