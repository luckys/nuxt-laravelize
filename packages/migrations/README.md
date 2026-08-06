# `@nuxt-laravelize/migrations`

[Espanol](./README.es.md) | English

Portable, deterministic database migration runner

## Install

```bash
pnpm add @nuxt-laravelize/migrations
```

## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./console` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Migrations

`@nuxt-laravelize/migrations` is ORM-neutral. Sources are explicit and IDs are namespaced as `namespace:name`; no dependency scanning occurs. Before mutation the runner validates dialects, dependencies, cycles, duplicate IDs, applied history, and checksums. `up`, `rollback`, `reset`, and `fresh` select work while holding the backend lock, and each migration statement plus its history update runs in the same transaction. Irreversible migrations refuse rollback. `fresh` requires an exact ownership allowlist and never introspects unrelated objects.

`@nuxt-laravelize/migrations-drizzle` provides PostgreSQL and SQLite backends. PostgreSQL requires a pinned connection provider so advisory locking, SQL, and history share one session and transaction. SQLite uses callback-local immediate transactions. `migrationSourcesFor(dialect)` explicitly aggregates audit, idempotency, reliability, Scout, and workflow sources. Application sources can be loaded from caller-supplied paths with `discoverApplicationMigrations()`.

```ts
const runner = new MigrationRunner({
  dialect: 'postgresql',
  backend: new PostgresMigrationBackend(connectionProvider),
  sources: [...migrationSourcesFor('postgresql'), appMigrations],
})

await runner.up()
```

The `/console` entrypoint supplies `migrate:status`, `migrate:up`, `migrate:rollback`, `migrate:reset`, `migrate:fresh`, and `migrate:pretend`. Destructive commands require an affirmative interactive prompt.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#migrations). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/migrations-drizzle`](../migrations-drizzle/README.md), [`@nuxt-laravelize/database`](../database/README.md).
