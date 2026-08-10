# Nuxt Laravelize

English | [Espanol](./README.es.md)

Nuxt Laravelize is a pnpm monorepo of focused `@luckys_luis/nuxt-laravelize*` packages for Laravel-inspired server architecture in Nuxt `>=4.3 <5`. Install the preset for the complete stack or select only the capabilities your application needs.

## Packages

| Package | Purpose |
|---|---|
| `@luckys_luis/nuxt-laravelize-audit` | Secure append-only audit recording enriched by execution context |
| `@luckys_luis/nuxt-laravelize-authorization` | Portable centralized abilities and policies with scoped principals |
| `@luckys_luis/nuxt-laravelize-authorization-queue` | Opt-in per-attempt queue ability authorization with trusted principal reload |
| `@luckys_luis/nuxt-laravelize-audit-drizzle` | Optional PostgreSQL, SQLite, and Turso/libSQL audit stores |
| `@luckys_luis/nuxt-laravelize-ai-sdk` | Opt-in named AI model connections, typed agents, streaming, and testing |
| `@luckys_luis/nuxt-laravelize-agent-sdk` | Opt-in runtime-neutral agent invocation, dispatch, observation, and testing |
| `@luckys_luis/nuxt-laravelize-agents-cloudflare` | Cloudflare Agents 0.17.x adapter with native identity and API escape hatches |
| `@luckys_luis/nuxt-laravelize-agents-flue` | Flue beta.9 adapter for conversations, workflow runs, and opaque offsets |
| `@luckys_luis/nuxt-laravelize-broadcasting` | Server-side public, private, and presence channel broadcasting |
| `@luckys_luis/nuxt-laravelize-broadcasting-pusher` | Optional server-side Pusher Channels adapter |
| `@luckys_luis/nuxt-laravelize-cache` | Portable cache contract, TTL operations, atomic locks, counters, memoization, and in-memory driver |
| `@luckys_luis/nuxt-laravelize-cache-redis` | Optional Node-only Redis/Valkey cache adapter (not included in the preset) |
| `@luckys_luis/nuxt-laravelize-console` | Typed, dependency-injected commands with scoped execution and test fakes |
| `@luckys_luis/nuxt-laravelize-core` | Container, tokens, providers, lifecycle, and logging |
| `@luckys_luis/nuxt-laravelize-execution-context` | Immutable request/work identity, trusted correlation, and contextual logging |
| `@luckys_luis/nuxt-laravelize-execution-context-queue` | Transparent execution context propagation through queues |
| `@luckys_luis/nuxt-laravelize-encryption` | AES-256-GCM application encryption, purpose binding, and key rotation |
| `@luckys_luis/nuxt-laravelize-events` | Synchronous events and listeners |
| `@luckys_luis/nuxt-laravelize-filesystem` | Portable named disks, in-memory storage, and a root-confined local Node adapter |
| `@luckys_luis/nuxt-laravelize-filesystem-cloudflare` | Optional Cloudflare R2 binding-native filesystem adapter without the AWS SDK |
| `@luckys_luis/nuxt-laravelize-filesystem-aws` | Optional AWS SDK S3 filesystem adapter, also usable with R2's S3 API |
| `@luckys_luis/nuxt-laravelize-filesystem-aws-redis` | Shared Redis/Valkey store for restart-safe S3 upload confirmation |
| `@luckys_luis/nuxt-laravelize-queue` | Portable queue contracts, jobs, scoped execution, and in-memory driver |
| `@luckys_luis/nuxt-laravelize-queue-bullmq` | Node-only BullMQ driver and persistent worker |
| `@luckys_luis/nuxt-laravelize-queue-middleware` | Opt-in overlap locks, rate limits, and fixed-window exception throttling |
| `@luckys_luis/nuxt-laravelize-rate-limiter` | Cache-backed fixed-window rate limiting and Nitro middleware |
| `@luckys_luis/nuxt-laravelize-reliability` | Framework-neutral at-least-once outbox and idempotent inbox primitives |
| `@luckys_luis/nuxt-laravelize-reliability-drizzle` | Optional durable PostgreSQL, SQLite, and Turso reliability stores |
| `@luckys_luis/nuxt-laravelize-dead-letter` | Portable source-qualified dead-letter management contracts |
| `@luckys_luis/nuxt-laravelize-dead-letter-operations` | Optional fail-closed dead-letter operations dashboard (not in preset) |
| `@luckys_luis/nuxt-laravelize-reliability-queue` | Nuxt bridge from durable outbox/inbox messages to registered queue jobs |
| `@luckys_luis/nuxt-laravelize-routes` | Generated typed URL helpers from explicit route declarations |
| `@luckys_luis/nuxt-laravelize-events-queue` | Queued-listener integration between events and queues |
| `@luckys_luis/nuxt-laravelize-mail` | Mailables, mail manager, and transports |
| `@luckys_luis/nuxt-laravelize-migrations` | ORM-neutral transactional migration runner, checksums, and console commands |
| `@luckys_luis/nuxt-laravelize-migrations-drizzle` | PostgreSQL/SQLite backends and aggregate package migration sources |
| `@luckys_luis/nuxt-laravelize-notifications` | Notification channels, on-demand routing, and delivery lifecycle events |
| `@luckys_luis/nuxt-laravelize-notifications-broadcast` | Tenant-fenced realtime notifications through the configured broadcaster |
| `@luckys_luis/nuxt-laravelize-notifications-database` | Tenant-fenced persistent notifications with read/unread state |
| `@luckys_luis/nuxt-laravelize-notifications-database-drizzle` | Durable PostgreSQL, SQLite, and Turso database-notification stores |
| `@luckys_luis/nuxt-laravelize-notifications-mail` | Validated opt-in mail notification channel |
| `@luckys_luis/nuxt-laravelize-notifications-queue` | Versioned, recipient-reloading queued notification delivery |
| `@luckys_luis/nuxt-laravelize-notifications-webhook` | Durable tenant-fenced notification delivery through signed webhooks |
| `@luckys_luis/nuxt-laravelize-observability` | Vendor-neutral no-op foundation, safe HTTP spans, metrics, and testing fake |
| `@luckys_luis/nuxt-laravelize-observability-otel` | Optional OpenTelemetry API adapter; application-owned SDK/exporters |
| `@luckys_luis/nuxt-laravelize-observability-queue` | Optional bounded W3C queue propagation and semantic job telemetry |
| `@luckys_luis/nuxt-laravelize-pennant` | Scoped feature flags with lazy definitions, rich values, and portable stores |
| `@luckys_luis/nuxt-laravelize-scout` | Portable search contracts, named engines, fluent queries, and bulk indexing |
| `@luckys_luis/nuxt-laravelize-scout-drizzle` | Scout engines for PostgreSQL, SQLite, and Turso/libSQL through Drizzle-compatible clients |
| `@luckys_luis/nuxt-laravelize-http` | Nuxt-native HTTP client, requests, middleware, signed URLs, resources, pagination, and authorization |
| `@luckys_luis/nuxt-laravelize-hashing` | Versioned PBKDF2 password hashing and rehash detection |
| `@luckys_luis/nuxt-laravelize-database` | ORM-neutral factories and seeders |
| `@luckys_luis/nuxt-laravelize-database-drizzle` | Explicit async and sync Drizzle transaction manager adapters |
| `@luckys_luis/nuxt-laravelize-database-queue` | Explicit best-effort queue dispatch after confirmed database commit |
| `@luckys_luis/nuxt-laravelize-idempotency` | Lease-fenced HTTP idempotency, fingerprint conflicts, and response replay |
| `@luckys_luis/nuxt-laravelize-idempotency-drizzle` | Durable PostgreSQL, SQLite, and Turso idempotency stores |
| `@luckys_luis/nuxt-laravelize-testing` | Aggregate test harness and fakes |
| `@luckys_luis/nuxt-laravelize-validation` | Standard Schema validation, typed results, and error bags |
| `@luckys_luis/nuxt-laravelize-scheduler` | Framework-neutral schedules and an explicit Nitro 3 adapter |
| `@luckys_luis/nuxt-laravelize-scheduler-nuxt` | Opt-in Nuxt 4/Nitro 2 scheduler with policy-aware provider triggers |
| `@luckys_luis/nuxt-laravelize-webhooks` | Node-only signed outgoing and idempotent incoming webhooks |
| `@luckys_luis/nuxt-laravelize-workflows` | Persisted linear workflows with exact string-version resolution, format safety, recovery, and saga compensation |
| `@luckys_luis/nuxt-laravelize-workflows-drizzle` | Durable PostgreSQL, SQLite, and Turso workflow stores |
| `@luckys_luis/nuxt-laravelize-workflows-reliability` | Transactional ID-only wake-ups with exact-definition recovery preflight through the durable outbox |
| `@luckys_luis/nuxt-laravelize-workflows-queue` | ID-only queue scheduling with exact-definition preflight and store-driven reconciliation |
| `@luckys_luis/nuxt-laravelize` | Convenience preset with `nuxt-i18n-micro` integration |

## Installation

### Complete Nuxt preset

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
import Laravelize from '@luckys_luis/nuxt-laravelize'

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

Feature modules install and activate `@luckys_luis/nuxt-laravelize-core` transitively. Add adapters separately when required:

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

## Public Entrypoints

The package root is the Nuxt module entrypoint unless noted otherwise. Application code must use these public subpaths rather than package internals.

| Package | Runtime and adapter entrypoints | Testing entrypoint |
|---|---|---|
| `@luckys_luis/nuxt-laravelize-audit` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-audit-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-ai-sdk` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-agent-sdk` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-agents-cloudflare` | Package root | - |
| `@luckys_luis/nuxt-laravelize-agents-flue` | Package root | - |
| `@luckys_luis/nuxt-laravelize-database-drizzle` | Package root | - |
| `@luckys_luis/nuxt-laravelize-idempotency` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-idempotency-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-workflows` | Package root | - |
| `@luckys_luis/nuxt-laravelize-workflows-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-workflows-reliability` | Package root | - |
| `@luckys_luis/nuxt-laravelize-workflows-queue` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-cache` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-cache-redis` | package root | — |
| `@luckys_luis/nuxt-laravelize-console` | Package root, `/node` | `/testing` |
| `@luckys_luis/nuxt-laravelize-core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `@luckys_luis/nuxt-laravelize-authorization-queue` | Nuxt module, `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-execution-context` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-execution-context-queue` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-encryption` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-events` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-filesystem` | `/runtime`, `/node` | `/testing` |
| `@luckys_luis/nuxt-laravelize-filesystem-cloudflare` | Package root | - |
| `@luckys_luis/nuxt-laravelize-filesystem-aws` | Package root | - |
| `@luckys_luis/nuxt-laravelize-queue` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-queue-bullmq` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-rate-limiter` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-reliability` | Package root | `/testing` |
| `@luckys_luis/nuxt-laravelize-dead-letter` | Package root | `/testing` |
| `@luckys_luis/nuxt-laravelize-dead-letter-operations` | Nuxt module | `/runtime`, `/runtime/server` |
| `@luckys_luis/nuxt-laravelize-reliability-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso` | - |
| `@luckys_luis/nuxt-laravelize-reliability-queue` | Package root, `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-events-queue` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-mail` | `/runtime`, `/node` | `/testing` |
| `@luckys_luis/nuxt-laravelize-migrations` | Package root, `/console` | `/testing` |
| `@luckys_luis/nuxt-laravelize-migrations-drizzle` | Package root, `/postgres`, `/sqlite`, `/sources` | `/testing` |
| `@luckys_luis/nuxt-laravelize-notifications` | `/runtime` | `/testing` |
| `@luckys_luis/nuxt-laravelize-observability` | `/runtime`, `/runtime/server` | `/testing` |
| `@luckys_luis/nuxt-laravelize-observability-otel` | Package root, `/runtime/server` | - |
| `@luckys_luis/nuxt-laravelize-observability-queue` | Package root | - |
| `@luckys_luis/nuxt-laravelize-pennant` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-scout` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-scout-drizzle` | Package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `@luckys_luis/nuxt-laravelize-http` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-hashing` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-database` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-database-queue` | Package root | - |
| `@luckys_luis/nuxt-laravelize-testing` | Package root | Package root |
| `@luckys_luis/nuxt-laravelize-validation` | `/runtime` | - |
| `@luckys_luis/nuxt-laravelize-scheduler` | Package root, `/nitro3` | - |
| `@luckys_luis/nuxt-laravelize-scheduler-nuxt` | Nuxt module, `/runtime`, `/adapters`, `/compiler`, `/cache-lock` | - |
| `@luckys_luis/nuxt-laravelize-webhooks` | Package root | `/testing` |
| `@luckys_luis/nuxt-laravelize` | Package root | - |

Examples:

```ts
import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize-testing'
import { NodemailerMailer } from '@luckys_luis/nuxt-laravelize-mail/node'
```

## Scheduler Boundary

`@luckys_luis/nuxt-laravelize-scheduler` is framework-neutral and is not part of `@luckys_luis/nuxt-laravelize`. Use the opt-in `@luckys_luis/nuxt-laravelize-scheduler-nuxt` module for Nuxt 4; it compiles explicit declarations into Nuxt-owned Nitro 2 tasks without replacing Nitro. Generated wrappers execute maintenance, overlap, one-server, queue, and lifecycle policies through an application-provided runtime scope. Redis/Valkey locks are available through `/cache-lock`.

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
- Every directory under [`packages/`](./packages) includes a detailed [`README.md`](./packages/core/README.md) and [`README.es.md`](./packages/core/README.es.md) with package-specific examples, public entrypoints, boundaries and related packages.
- [Migration guide](./docs/migration-to-modular-packages.md): replacements for the removed legacy facade.
- [Candidate roadmap](./docs/roadmap.md): prioritized Laravel-inspired capabilities, constraints, and graduation criteria.

## License

MIT
