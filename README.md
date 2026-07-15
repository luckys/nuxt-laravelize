# Nuxt Laravelize

English | [Espanol](./README.es.md)

Nuxt Laravelize is a pnpm monorepo of focused `@nuxt-laravelize/*` packages for Laravel-inspired server architecture in Nuxt `>=4.3 <5`. Install the preset for the complete stack or select only the capabilities your application needs.

## Packages

| Package | Purpose |
|---|---|
| `@nuxt-laravelize/core` | Container, tokens, providers, lifecycle, and logging |
| `@nuxt-laravelize/events` | Synchronous events and listeners |
| `@nuxt-laravelize/queue` | Portable queue contracts, jobs, scoped execution, and in-memory driver |
| `@nuxt-laravelize/queue-bullmq` | Node-only BullMQ driver and persistent worker |
| `@nuxt-laravelize/events-queue` | Queued-listener integration between events and queues |
| `@nuxt-laravelize/mail` | Mailables, mail manager, and transports |
| `@nuxt-laravelize/notifications` | Notification channels and on-demand routing |
| `@nuxt-laravelize/http` | Nuxt-native HTTP client, requests, middleware, resources, pagination, and authorization |
| `@nuxt-laravelize/database` | ORM-neutral factories and seeders |
| `@nuxt-laravelize/testing` | Aggregate test harness and fakes |
| `@nuxt-laravelize/scheduler` | Framework-neutral schedules and an explicit Nitro 3 adapter |
| `@nuxt-laravelize/nuxt` | Convenience preset with `nuxt-i18n-micro` integration |

## Installation

### Complete Nuxt preset

```bash
pnpm add @nuxt-laravelize/nuxt
```

```ts
import Laravelize from '@nuxt-laravelize/nuxt'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'en', iso: 'en-US', dir: 'ltr' }],
    defaultLocale: 'en',
    translationDir: 'locales',
  },
})
```

The preset activates core, database, events, queued listeners, HTTP, mail, notifications, the portable queue, and `nuxt-i18n-micro`. Translations use its Nuxt-native `$t()` API and JSON dictionaries instead of Laravel-style `__()`. The preset does not install BullMQ or activate the scheduler.

```vue
<template>
  <p>{{ $t('welcome', { name: 'Ada' }) }}</p>
</template>
```

### Granular features

Install and declare only the Nuxt feature modules you use:

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/http
```

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxt-laravelize/events',
    '@nuxt-laravelize/http',
  ],
})
```

Feature modules install and activate `@nuxt-laravelize/core` transitively. Add adapters separately when required:

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue @nuxt-laravelize/events-queue
pnpm add -D @nuxt-laravelize/testing
```

## Public Entrypoints

The package root is the Nuxt module entrypoint unless noted otherwise. Application code must use these public subpaths rather than package internals.

| Package | Runtime and adapter entrypoints | Testing entrypoint |
|---|---|---|
| `@nuxt-laravelize/core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `@nuxt-laravelize/events` | `/runtime` | `/testing` |
| `@nuxt-laravelize/queue` | `/runtime` | `/testing` |
| `@nuxt-laravelize/queue-bullmq` | `/runtime` | - |
| `@nuxt-laravelize/events-queue` | `/runtime` | - |
| `@nuxt-laravelize/mail` | `/runtime`, `/node` | `/testing` |
| `@nuxt-laravelize/notifications` | `/runtime` | `/testing` |
| `@nuxt-laravelize/http` | `/runtime` | - |
| `@nuxt-laravelize/database` | `/runtime` | - |
| `@nuxt-laravelize/testing` | Package root | Package root |
| `@nuxt-laravelize/scheduler` | Package root, `/nitro3` | - |
| `@nuxt-laravelize/nuxt` | Package root | - |

Examples:

```ts
import { createToken } from '@nuxt-laravelize/core/runtime'
import { mountLaravelize } from '@nuxt-laravelize/testing'
import { NodemailerMailer } from '@nuxt-laravelize/mail/node'
```

## Scheduler Boundary

`@nuxt-laravelize/scheduler` is framework-neutral and is not part of `@nuxt-laravelize/nuxt`. Its `/nitro3` adapter targets exactly `nitro@3.0.260610-beta`.

Nuxt 4 currently owns its Nitro 2 dependency. Do not install Nitro 3 into a Nuxt 4 application or use the scheduler adapter to replace Nuxt's internal Nitro version. Use the `/nitro3` adapter only in an explicit Nitro 3 application that satisfies its peer version.

## Development

```bash
pnpm install
pnpm build:packages   # build every workspace package
pnpm test:packages    # run package test suites
pnpm typecheck        # type-check root and packages
pnpm lint             # lint the monorepo
pnpm pack:test        # build tarballs and run package smoke tests
pnpm dev              # prepare and start the Nuxt playground
```

Releases use Changesets:

```bash
pnpm changeset
pnpm version-packages
pnpm release:packages
```

See [Migrating to modular packages](./docs/migration-to-modular-packages.md) when updating an older application.

## Documentation

- [Module and API guide](./docs/modules.md): installation, public APIs and code examples for every package.
- [Spanish module and API guide](./docs/modules.es.md): the same reference in Spanish.
- [Migration guide](./docs/migration-to-modular-packages.md): replacements for the removed legacy facade.

## License

MIT
