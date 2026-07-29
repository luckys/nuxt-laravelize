# Nuxt Laravelize

English | [Espanol](./README.es.md)

Nuxt Laravelize is a pnpm monorepo of focused `@nuxt-laravelize/*` packages for Laravel-inspired server architecture in Nuxt `>=4.3 <5`. Install the preset for the complete stack or select only the capabilities your application needs.

## Packages

| Package | Purpose |
|---|---|
| `@nuxt-laravelize/audit` | Secure append-only audit recording enriched by execution context |
| `@nuxt-laravelize/authorization` | Portable centralized abilities and policies with scoped principals |
| `@nuxt-laravelize/audit-drizzle` | Optional PostgreSQL, SQLite, and Turso/libSQL audit stores |
| `@nuxt-laravelize/ai-sdk` | Opt-in named AI model connections, typed agents, streaming, and testing |
| `@nuxt-laravelize/agent-sdk` | Opt-in runtime-neutral agent invocation, dispatch, observation, and testing |
| `@nuxt-laravelize/agents-cloudflare` | Cloudflare Agents 0.17.x adapter with native identity and API escape hatches |
| `@nuxt-laravelize/agents-flue` | Flue beta.9 adapter for conversations, workflow runs, and opaque offsets |
| `@nuxt-laravelize/broadcasting` | Server-side public, private, and presence channel broadcasting |
| `@nuxt-laravelize/broadcasting-pusher` | Optional server-side Pusher Channels adapter |
| `@nuxt-laravelize/cache` | Portable cache contract, TTL operations, atomic locks, counters, memoization, and in-memory driver |
| `@nuxt-laravelize/cache-redis` | Optional Node-only Redis/Valkey cache adapter (not included in the preset) |
| `@nuxt-laravelize/console` | Typed, dependency-injected commands with scoped execution and test fakes |
| `@nuxt-laravelize/core` | Container, tokens, providers, lifecycle, and logging |
| `@nuxt-laravelize/execution-context` | Immutable request/work identity, trusted correlation, and contextual logging |
| `@nuxt-laravelize/execution-context-queue` | Transparent execution context propagation through queues |
| `@nuxt-laravelize/encryption` | AES-256-GCM application encryption, purpose binding, and key rotation |
| `@nuxt-laravelize/events` | Synchronous events and listeners |
| `@nuxt-laravelize/filesystem` | Portable named disks, in-memory storage, and a root-confined local Node adapter |
| `@nuxt-laravelize/filesystem-cloudflare` | Optional Cloudflare R2 binding-native filesystem adapter without the AWS SDK |
| `@nuxt-laravelize/filesystem-aws` | Optional AWS SDK S3 filesystem adapter, also usable with R2's S3 API |
| `@nuxt-laravelize/filesystem-aws-redis` | Shared Redis/Valkey store for restart-safe S3 upload confirmation |
| `@nuxt-laravelize/queue` | Portable queue contracts, jobs, scoped execution, and in-memory driver |
| `@nuxt-laravelize/queue-bullmq` | Node-only BullMQ driver and persistent worker |
| `@nuxt-laravelize/queue-middleware` | Opt-in overlap locks and fixed-window job rate limits |
| `@nuxt-laravelize/rate-limiter` | Cache-backed fixed-window rate limiting and Nitro middleware |
| `@nuxt-laravelize/reliability` | Framework-neutral at-least-once outbox and idempotent inbox primitives |
| `@nuxt-laravelize/reliability-drizzle` | Optional durable PostgreSQL, SQLite, and Turso reliability stores |
| `@nuxt-laravelize/dead-letter` | Portable source-qualified dead-letter management contracts |
| `@nuxt-laravelize/dead-letter-operations` | Optional fail-closed dead-letter operations dashboard (not in preset) |
| `@nuxt-laravelize/reliability-queue` | Nuxt bridge from durable outbox/inbox messages to registered queue jobs |
| `@nuxt-laravelize/routes` | Generated typed URL helpers from explicit route declarations |
| `@nuxt-laravelize/events-queue` | Queued-listener integration between events and queues |
| `@nuxt-laravelize/mail` | Mailables, mail manager, and transports |
| `@nuxt-laravelize/migrations` | ORM-neutral transactional migration runner, checksums, and console commands |
| `@nuxt-laravelize/migrations-drizzle` | PostgreSQL/SQLite backends and aggregate package migration sources |
| `@nuxt-laravelize/notifications` | Notification channels, on-demand routing, and delivery lifecycle events |
| `@nuxt-laravelize/notifications-broadcast` | Tenant-fenced realtime notifications through the configured broadcaster |
| `@nuxt-laravelize/notifications-database` | Tenant-fenced persistent notifications with read/unread state |
| `@nuxt-laravelize/notifications-database-drizzle` | Durable PostgreSQL, SQLite, and Turso database-notification stores |
| `@nuxt-laravelize/notifications-mail` | Validated opt-in mail notification channel |
| `@nuxt-laravelize/notifications-queue` | Versioned, recipient-reloading queued notification delivery |
| `@nuxt-laravelize/notifications-webhook` | Durable tenant-fenced notification delivery through signed webhooks |
| `@nuxt-laravelize/observability` | Vendor-neutral no-op foundation, safe HTTP spans, metrics, and testing fake |
| `@nuxt-laravelize/observability-otel` | Optional OpenTelemetry API adapter; application-owned SDK/exporters |
| `@nuxt-laravelize/observability-queue` | Optional bounded W3C queue propagation and semantic job telemetry |
| `@nuxt-laravelize/pennant` | Scoped feature flags with lazy definitions, rich values, and portable stores |
| `@nuxt-laravelize/scout` | Portable search contracts, named engines, fluent queries, and bulk indexing |
| `@nuxt-laravelize/scout-drizzle` | Scout engines for PostgreSQL, SQLite, and Turso/libSQL through Drizzle-compatible clients |
| `@nuxt-laravelize/http` | Nuxt-native HTTP client, requests, middleware, signed URLs, resources, pagination, and authorization |
| `@nuxt-laravelize/hashing` | Versioned PBKDF2 password hashing and rehash detection |
| `@nuxt-laravelize/database` | ORM-neutral factories and seeders |
| `@nuxt-laravelize/database-drizzle` | Explicit async and sync Drizzle transaction manager adapters |
| `@nuxt-laravelize/idempotency` | Lease-fenced HTTP idempotency, fingerprint conflicts, and response replay |
| `@nuxt-laravelize/idempotency-drizzle` | Durable PostgreSQL, SQLite, and Turso idempotency stores |
| `@nuxt-laravelize/testing` | Aggregate test harness and fakes |
| `@nuxt-laravelize/validation` | Standard Schema validation, typed results, and error bags |
| `@nuxt-laravelize/scheduler` | Framework-neutral schedules and an explicit Nitro 3 adapter |
| `@nuxt-laravelize/scheduler-nuxt` | Opt-in Nuxt 4/Nitro 2 scheduler with policy-aware provider triggers |
| `@nuxt-laravelize/webhooks` | Node-only signed outgoing and idempotent incoming webhooks |
| `@nuxt-laravelize/workflows` | Persisted linear workflows with exact string-version resolution, format safety, recovery, and saga compensation |
| `@nuxt-laravelize/workflows-drizzle` | Durable PostgreSQL, SQLite, and Turso workflow stores |
| `@nuxt-laravelize/workflows-reliability` | Transactional ID-only wake-ups with exact-definition recovery preflight through the durable outbox |
| `@nuxt-laravelize/workflows-queue` | ID-only queue scheduling with exact-definition preflight and store-driven reconciliation |
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

The preset activates cache, core, database, encryption, events, feature flags, filesystem disks, hashing, queued listeners, HTTP, mail, notifications, rate limiting, Scout with its memory driver, validation, the portable queue, and the reliability queue bridge. It activates `nuxt-i18n-micro` only when usable locales are configured. It binds no volatile Inbox or Outbox store in production: the application must provide durable stores. Translations use the Nuxt-native `$t()` API and JSON dictionaries instead of Laravel-style `__()`; Nitro code uses `useServerLocalization(event)` or the eventless `createServerLocalization(locale)`. Webhooks remain an opt-in; the preset also does not install BullMQ, `reliability-drizzle`, cloud filesystem adapters, Scout database adapters, or the scheduler.

Generated typed routes from explicit declarations are also included in the preset.

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
pnpm add @nuxt-laravelize/scout @nuxt-laravelize/scout-drizzle drizzle-orm
pnpm add @nuxt-laravelize/audit @nuxt-laravelize/audit-drizzle drizzle-orm
pnpm add @nuxt-laravelize/ai-sdk ai zod @ai-sdk/anthropic
pnpm add @nuxt-laravelize/reliability @nuxt-laravelize/webhooks
pnpm add @nuxt-laravelize/reliability @nuxt-laravelize/reliability-drizzle drizzle-orm
pnpm add @nuxt-laravelize/database @nuxt-laravelize/database-drizzle drizzle-orm
pnpm add @nuxt-laravelize/idempotency
pnpm add @nuxt-laravelize/workflows
pnpm add @nuxt-laravelize/idempotency @nuxt-laravelize/idempotency-drizzle drizzle-orm
pnpm add @nuxt-laravelize/workflows @nuxt-laravelize/workflows-drizzle drizzle-orm
pnpm add @nuxt-laravelize/workflows-reliability @nuxt-laravelize/reliability @nuxt-laravelize/database
pnpm add @nuxt-laravelize/workflows @nuxt-laravelize/workflows-queue @nuxt-laravelize/queue
pnpm add @nuxt-laravelize/filesystem @nuxt-laravelize/filesystem-cloudflare
pnpm add @nuxt-laravelize/filesystem @nuxt-laravelize/filesystem-aws
pnpm add -D @nuxt-laravelize/testing
```

## Public Entrypoints

The package root is the Nuxt module entrypoint unless noted otherwise. Application code must use these public subpaths rather than package internals.

| Package | Runtime and adapter entrypoints | Testing entrypoint |
|---|---|---|
| `@nuxt-laravelize/audit` | `/runtime`, `/runtime/server` | `/testing` |
| `@nuxt-laravelize/audit-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@nuxt-laravelize/ai-sdk` | `/runtime`, `/runtime/server` | `/testing` |
| `@nuxt-laravelize/agent-sdk` | `/runtime`, `/runtime/server` | `/testing` |
| `@nuxt-laravelize/agents-cloudflare` | Package root | - |
| `@nuxt-laravelize/agents-flue` | Package root | - |
| `@nuxt-laravelize/database-drizzle` | Package root | - |
| `@nuxt-laravelize/idempotency` | `/runtime` | - |
| `@nuxt-laravelize/idempotency-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@nuxt-laravelize/workflows` | Package root | - |
| `@nuxt-laravelize/workflows-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@nuxt-laravelize/workflows-reliability` | Package root | - |
| `@nuxt-laravelize/workflows-queue` | `/runtime` | - |
| `@nuxt-laravelize/cache` | `/runtime` | `/testing` |
| `@nuxt-laravelize/cache-redis` | package root | — |
| `@nuxt-laravelize/console` | Package root, `/node` | `/testing` |
| `@nuxt-laravelize/core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `@nuxt-laravelize/execution-context` | `/runtime`, `/runtime/server` | `/testing` |
| `@nuxt-laravelize/execution-context-queue` | `/runtime` | - |
| `@nuxt-laravelize/encryption` | `/runtime` | - |
| `@nuxt-laravelize/events` | `/runtime` | `/testing` |
| `@nuxt-laravelize/filesystem` | `/runtime`, `/node` | `/testing` |
| `@nuxt-laravelize/filesystem-cloudflare` | Package root | - |
| `@nuxt-laravelize/filesystem-aws` | Package root | - |
| `@nuxt-laravelize/queue` | `/runtime` | `/testing` |
| `@nuxt-laravelize/queue-bullmq` | `/runtime` | - |
| `@nuxt-laravelize/rate-limiter` | `/runtime` | - |
| `@nuxt-laravelize/reliability` | Package root | `/testing` |
| `@nuxt-laravelize/dead-letter` | Package root | `/testing` |
| `@nuxt-laravelize/dead-letter-operations` | Nuxt module | `/runtime`, `/runtime/server` |
| `@nuxt-laravelize/reliability-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso` | - |
| `@nuxt-laravelize/reliability-queue` | Package root, `/runtime` | - |
| `@nuxt-laravelize/events-queue` | `/runtime` | - |
| `@nuxt-laravelize/mail` | `/runtime`, `/node` | `/testing` |
| `@nuxt-laravelize/migrations` | Package root, `/console` | `/testing` |
| `@nuxt-laravelize/migrations-drizzle` | Package root, `/postgres`, `/sqlite`, `/sources` | `/testing` |
| `@nuxt-laravelize/notifications` | `/runtime` | `/testing` |
| `@nuxt-laravelize/observability` | `/runtime`, `/runtime/server` | `/testing` |
| `@nuxt-laravelize/observability-otel` | Package root, `/runtime/server` | - |
| `@nuxt-laravelize/observability-queue` | Package root | - |
| `@nuxt-laravelize/pennant` | `/runtime` | - |
| `@nuxt-laravelize/scout` | `/runtime` | - |
| `@nuxt-laravelize/scout-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@nuxt-laravelize/http` | `/runtime` | - |
| `@nuxt-laravelize/hashing` | `/runtime` | - |
| `@nuxt-laravelize/database` | `/runtime` | - |
| `@nuxt-laravelize/testing` | Package root | Package root |
| `@nuxt-laravelize/validation` | `/runtime` | - |
| `@nuxt-laravelize/scheduler` | Package root, `/nitro3` | - |
| `@nuxt-laravelize/scheduler-nuxt` | Nuxt module, `/runtime`, `/adapters`, `/compiler`, `/cache-lock` | - |
| `@nuxt-laravelize/webhooks` | Package root | `/testing` |
| `@nuxt-laravelize/nuxt` | Package root | - |

Examples:

```ts
import { createToken } from '@nuxt-laravelize/core/runtime'
import { mountLaravelize } from '@nuxt-laravelize/testing'
import { NodemailerMailer } from '@nuxt-laravelize/mail/node'
```

## Scheduler Boundary

`@nuxt-laravelize/scheduler` is framework-neutral and is not part of `@nuxt-laravelize/nuxt`. Use the opt-in `@nuxt-laravelize/scheduler-nuxt` module for Nuxt 4; it compiles explicit declarations into Nuxt-owned Nitro 2 tasks without replacing Nitro. Generated wrappers execute maintenance, overlap, one-server, queue, and lifecycle policies through an application-provided runtime scope. Redis/Valkey locks are available through `/cache-lock`.

The separate `/nitro3` adapter targets exactly `nitro@3.0.260610-beta`. Do not install Nitro 3 into a Nuxt 4 application. Use `/nitro3` only in an explicit Nitro 3 application that satisfies its peer version.

## Development

```bash
pnpm install
pnpm build:packages   # build every workspace package
pnpm test:packages    # run package test suites
pnpm test:integration:postgres # prove workflow/outbox atomicity against PostgreSQL
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
- [Candidate roadmap](./docs/roadmap.md): prioritized Laravel-inspired capabilities, constraints, and graduation criteria.

## License

MIT
