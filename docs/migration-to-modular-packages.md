# Migrating to modular packages

English | [Espanol](./migration-to-modular-packages.es.md)

The modular release is published under the personal npm scope `@luckys_luis`. Install `@luckys_luis/nuxt-laravelize` for the standard stack or select individual `@luckys_luis/nuxt-laravelize-*` packages. There are no compatibility re-exports or wrapper commands for the previous monolithic facade.

## Choose an installation

For the standard stack, install the preset:

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize'],
})
```

For a granular installation, add and declare only the features in use:

```bash
pnpm add @luckys_luis/nuxt-laravelize-events @luckys_luis/nuxt-laravelize-queue
```

```ts
export default defineNuxtConfig({
  modules: [
    '@luckys_luis/nuxt-laravelize-events',
    '@luckys_luis/nuxt-laravelize-queue',
  ],
})
```

Feature modules install and activate `@luckys_luis/nuxt-laravelize-core` transitively. Do not declare core separately unless the application uses the core module by itself.

## Direct mappings

| Removed package or subpath | Replacement |
|---|---|
| Previous facade in `modules` | `@luckys_luis/nuxt-laravelize` or the selected feature packages |
| Previous facade `/core` entrypoint | `@luckys_luis/nuxt-laravelize-core/runtime` |
| Previous facade `/events` entrypoint | `@luckys_luis/nuxt-laravelize-events/runtime` |
| Previous facade `/queue` entrypoint | `@luckys_luis/nuxt-laravelize-queue/runtime` |
| Previous facade `/mail` entrypoint | `@luckys_luis/nuxt-laravelize-mail/runtime` |
| Previous facade `/notifications` entrypoint | `@luckys_luis/nuxt-laravelize-notifications/runtime` |
| Previous facade `/http` entrypoint | `@luckys_luis/nuxt-laravelize-http/runtime` |
| Previous facade `/database` entrypoint | `@luckys_luis/nuxt-laravelize-database/runtime` |
| Previous facade `/testing` entrypoint | `@luckys_luis/nuxt-laravelize-testing` |
| Laravel-style `Translator`, `DictionaryTranslator`, `translatorToken`, `__()` and `choice()` | `nuxt-i18n-micro`, `useI18n()`, `$t()` and `$tc()` |
| `useTranslator(event)` in a Nitro handler | `await useTranslationServerMiddleware(event)` |
| Framework-neutral `selectPluralForm()` | Application-owned pluralization or the `i18n.plural` option |
| Old queued-listener APIs | `@luckys_luis/nuxt-laravelize-events-queue/runtime` |
| Old BullMQ APIs | `@luckys_luis/nuxt-laravelize-queue-bullmq/runtime` |
| Node mail adapters | `@luckys_luis/nuxt-laravelize-mail/node` |
| `laravelize-queue-work` command | Install `@luckys_luis/nuxt-laravelize-queue-bullmq` and provide `laravelize.queue.config.mjs` |
| `laravelize-db-seed` command | Install `@luckys_luis/nuxt-laravelize-database` and provide `laravelize.seed.config.mjs` |

Testing fakes are also available from feature-specific entrypoints when an aggregate harness is unnecessary:

```ts
import { EventFake } from '@luckys_luis/nuxt-laravelize-events/testing'
import { FakeLogger } from '@luckys_luis/nuxt-laravelize-core/testing'
import { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'
import { MailFake } from '@luckys_luis/nuxt-laravelize-mail/testing'
import { NotificationFake } from '@luckys_luis/nuxt-laravelize-notifications/testing'
```

For complete package examples, see the [module and API guide](./modules.md).

## Scheduler and Nitro

The scheduler is a separate package and is not activated by `@luckys_luis/nuxt-laravelize`:

```bash
pnpm add @luckys_luis/nuxt-laravelize-scheduler
```

The framework-neutral API is exported from `@luckys_luis/nuxt-laravelize-scheduler`. Its experimental `@luckys_luis/nuxt-laravelize-scheduler/nitro3` adapter requires exactly `nitro@3.0.260610-beta`.

Nuxt 4 uses its own Nitro 2 dependency. Do not install Nitro 3 to replace Nuxt's internal version; use the adapter only in an explicit Nitro 3 application.
