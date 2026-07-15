# Migrating to modular packages

The old `@luckys_luis/nuxt-laravelize` package and facade have been removed. There are no compatibility re-exports or wrapper commands. Replace the dependency, Nuxt module declaration, imports, and CLI ownership with the corresponding `@nuxt-laravelize/*` packages.

## Choose an installation

For the standard stack, replace the old module with the preset:

```bash
pnpm remove @luckys_luis/nuxt-laravelize
pnpm add @nuxt-laravelize/nuxt
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/nuxt'],
})
```

For a granular installation, add and declare only the features in use:

```bash
pnpm remove @luckys_luis/nuxt-laravelize
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue
```

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxt-laravelize/events',
    '@nuxt-laravelize/queue',
  ],
})
```

Feature modules install and activate `@nuxt-laravelize/core` transitively. Do not declare core separately unless the application uses the core module by itself.

## Direct mappings

| Removed package or subpath | Replacement |
|---|---|
| `@luckys_luis/nuxt-laravelize` in `modules` | `@nuxt-laravelize/nuxt` or the selected feature modules |
| `@luckys_luis/nuxt-laravelize/core` | `@nuxt-laravelize/core/runtime` |
| `@luckys_luis/nuxt-laravelize/events` | `@nuxt-laravelize/events/runtime` |
| `@luckys_luis/nuxt-laravelize/queue` | `@nuxt-laravelize/queue/runtime` |
| `@luckys_luis/nuxt-laravelize/mail` | `@nuxt-laravelize/mail/runtime` |
| `@luckys_luis/nuxt-laravelize/notifications` | `@nuxt-laravelize/notifications/runtime` |
| `@luckys_luis/nuxt-laravelize/http` | `@nuxt-laravelize/http/runtime` |
| `@luckys_luis/nuxt-laravelize/database` | `@nuxt-laravelize/database/runtime` |
| `@luckys_luis/nuxt-laravelize/testing` | `@nuxt-laravelize/testing` |
| Laravel-style `Translator`, `DictionaryTranslator`, `translatorToken`, `__()` and `choice()` | `nuxt-i18n-micro`, `useI18n()`, `$t()` and `$tc()` |
| `useTranslator(event)` in a Nitro handler | `await useTranslationServerMiddleware(event)` |
| Framework-neutral `selectPluralForm()` | Application-owned pluralization or the `i18n.plural` option |
| Old queued-listener APIs | `@nuxt-laravelize/events-queue/runtime` |
| Old BullMQ APIs | `@nuxt-laravelize/queue-bullmq/runtime` |
| Node mail adapters | `@nuxt-laravelize/mail/node` |
| `laravelize-queue-work` command | Install `@nuxt-laravelize/queue-bullmq` |
| `laravelize-db-seed` command | Install `@nuxt-laravelize/database` |

Testing fakes are also available from feature-specific entrypoints when an aggregate harness is unnecessary:

```ts
import { EventFake } from '@nuxt-laravelize/events/testing'
import { QueueFake } from '@nuxt-laravelize/queue/testing'
import { MailFake } from '@nuxt-laravelize/mail/testing'
```

## Scheduler and Nitro

The scheduler is a separate package and is not activated by `@nuxt-laravelize/nuxt`:

```bash
pnpm add @nuxt-laravelize/scheduler
```

The framework-neutral API is exported from `@nuxt-laravelize/scheduler`. Its experimental `@nuxt-laravelize/scheduler/nitro3` adapter requires exactly `nitro@3.0.260610-beta`.

Nuxt 4 uses its own Nitro 2 dependency. Do not install Nitro 3 to replace Nuxt's internal version; use the adapter only in an explicit Nitro 3 application.
