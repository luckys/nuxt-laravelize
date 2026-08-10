# `@luckys_luis/nuxt-laravelize-scout`

[Espanol](./README.es.md) | English

Portable full-text search contracts and builder for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-scout
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-scout'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |

## Scout search

`@luckys_luis/nuxt-laravelize-scout` provides portable searchable-model and engine contracts, a fluent builder, bulk import, and the server auto-import `useScout(event)`. Configure `laravelizeScout.driver` (default: `memory`). Engines are named, lazy, and cached; register adapters in an application provider before selecting them. `@luckys_luis/nuxt-laravelize-scout-drizzle` provides PostgreSQL, local SQLite, and Turso/libSQL helpers as `/postgres`, `/sqlite`, and `/turso` subpaths.

```ts
const scout = useScout(event)
const results = await scout.search('articles', 'supportive care')
  .where('status', 'published')
  .whereIn('locale', ['en', 'es'])
  .orderBy('published_at', 'desc')
  .paginate(1, 20)

registerDrizzlePostgresDriver(scout, 'postgres', db, {
  filterableFields: ['status', 'locale'],
  sortableFields: ['published_at'],
})
scout.use('postgres')
```

```ts
import { registerDrizzleSQLiteDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/sqlite'
import { registerTursoDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/turso'

// Local Drizzle SQLite database (for example drizzle-orm/better-sqlite3)
registerDrizzleSQLiteDriver(scout, 'sqlite', sqliteDb, allowlists)
// @libsql/client-compatible client; batch(..., 'write') is transactional
registerTursoDriver(scout, 'turso', tursoClient, allowlists)
```

Models implement `searchableKey()`, `searchableType()`, and `toSearchableDocument()`. Use `update`, `delete`, `import`, and `flush` for index maintenance. PostgreSQL uses `websearch_to_tsquery` and a GIN-indexed `tsvector`; SQLite/libSQL use FTS5 and JSON1. All engines parameterize values, deny filter/sort fields by default, and make multi-write synchronization atomic where the client supports transactions. Pagination is capped at 100 and imports at 10,000 documents per batch. SQLite/libSQL requires a build with FTS5 enabled; apply `0001_create_scout_documents_sqlite.sql`. Authorize access before calling Scout and do not index secrets or unnecessary personal data.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#scout-search). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-scout-drizzle`](../scout-drizzle/README.md), [`@luckys_luis/nuxt-laravelize-authorization`](../authorization/README.md).
