# nuxt-laravelize

English | [Español](./README.es.md)

Nuxt 4 module that brings Laravel-inspired architecture primitives to Nuxt and Nitro: per-request DI container, auto-discovered providers, single-action controllers with validation, events, queues, mail, notifications, pagination, policy-based authorization, logging, i18n, seeding, and testing helpers — all wired around the CodelyTV-style DDD layout.

## The Laravelize stack

| Package | Role |
|---|---|
| **[`@luckys_luis/nuxt-laravelize`](./)** *(this one)* | Runtime — DI container, controllers, queues, mail, notifications, i18n, policies, seeders, factories, testing helpers. |
| [`@luckys_luis/nuxt-laravelize-config`](../nuxt-laravelize-config) | Toolchain — 12-rule DDD ESLint plugin, scaffolding CLI (`new:*`), shared presets, 15 AI skills with auto-link. |
| [`@luckys_luis/nuxt-ddd-toolkit`](../nuxt-ddd-toolkit) | Bootstrap layer — capability detection, 1 ESLint rule, 4 skills, minimal preflight CLI. |

## Contents

- [What this module ships](#what-this-module-ships)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Feature map](#feature-map)
- [Server composables](#server-composables)
- [CLIs (bins)](#clis-bins)
- [Testing helpers](#testing-helpers)
- [Development](#development)

## What this module ships

- DI container (awilix) scoped per request + type-safe Tokens.
- Service Providers auto-discovered by convention + programmatic registration.
- Single-action controllers via `defineLaravelizedHandler` + `FormRequest` (Zod / Valibot / Standard Schema).
- Resources (`Resource`, `ResourceCollection`, `PaginatedResourceCollection`).
- Events with `Dispatcher` and sync/queued listeners.
- Queue with `memory` and `bullmq` drivers + worker bin (`laravelize-queue-work`).
- Authorization `Gate` + `Policy` registry (auto-discovered from `server/policies/*.policy.ts`).
- Pagination (`SimplePaginator`, `LengthAwarePaginator`, `CursorPaginator`).
- Logging (`ConsoleLogger`, `StructuredLogger`, `FileLogger`) wired into queue and events.
- Mail (`LogMailer`, `NodemailerMailer`, `ResendMailer`).
- Notifications with `mail`, `log`, `queue` channels.
- Localization (`DictionaryTranslator` with pluralization and fallback locale).
- Database: `Seeder` + `Factory<T>` + `laravelize-db-seed` bin.
- Testing helpers (`./testing` subpath): `mountLaravelize`, `FakeDispatcher`, `FakeQueue`, `FakeMailer`, `FakeNotificationManager`, `FakeLogger`.

## Installation

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

Required peers: `nuxt >= 4.0.0`, `h3 >= 1.0.0`.
Optional peers: `bullmq`, `ioredis`, `zod`, `valibot`, `drizzle-orm`, `nodemailer`, `resend`, `@faker-js/faker`.

## Quick start

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

## Feature map

| Area | Main symbols | Server helper |
|---|---|---|
| Container | `Container`, `Token`, `createToken` | `useContainer(event)` |
| Providers | `ServiceProvider`, `Kernel` | auto-discovery |
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

## Server composables

All auto-imported in server routes:

- `useContainer(event)` — request-scoped container.
- `useLogger(event)`, `useMailer(event)`, `useNotifier(event)`, `useTranslator(event)`.

## CLIs (bins)

```bash
# Queue worker
laravelize-queue-work --queue=default --concurrency=4 --config=laravelize.queue.config.ts

# Database seeder
laravelize-db-seed --class=DemoInvoiceSeeder --config=laravelize.seed.config.ts
```

For scaffolding (contexts, aggregates, use cases…) install `@luckys_luis/nuxt-laravelize-config` and use `pnpm laravelize new:*`.

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

## Runtime behaviour

When the container is active, every Nitro request receives a scoped container on `event.context.laravelizeContainer`. Providers discovered under `server/contexts/**/infrastructure/*ServiceProvider.ts` are registered and booted automatically.

## Development

```bash
pnpm install
pnpm dev:prepare
pnpm dev        # spin the playground
pnpm test       # vitest (342 tests)
pnpm typecheck  # vue-tsc --noEmit
pnpm lint
```

## Release flow

```bash
pnpm lint && pnpm test && pnpm typecheck
pnpm prepack
pnpm publish
```
