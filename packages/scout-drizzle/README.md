# `@luckys_luis/nuxt-laravelize-scout-drizzle`

[Espanol](./README.es.md) | English

PostgreSQL, SQLite, and Turso/libSQL search engines for Nuxt Laravelize Scout

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-scout-drizzle @luckys_luis/nuxt-laravelize-scout drizzle-orm
```

## Package-specific usage


### Register a Drizzle search engine

Choose PostgreSQL, local SQLite, or Turso/libSQL and pass explicit filter and sort allowlists. Apply the matching migration before indexing; values are parameterized and unlisted fields remain unavailable.

```ts
import { registerDrizzlePostgresDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/postgres'

registerDrizzlePostgresDriver(scout, 'postgres', db, {
  filterableFields: ['status', 'locale'],
  sortableFields: ['published_at'],
})
scout.use('postgres')
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./postgres` | Public entrypoint for this package. |
| `./sqlite` | Public entrypoint for this package. |
| `./turso` | Public entrypoint for this package. |
| `./schema` | Public entrypoint for this package. |
| `./sqlite-schema` | Public entrypoint for this package. |
| `./migrations` | Public entrypoint for this package. |
| `./migrations/0000_create_scout_documents.sql` | Public entrypoint for this package. |
| `./migrations/0001_create_scout_documents_sqlite.sql` | Public entrypoint for this package. |

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

[`@luckys_luis/nuxt-laravelize-scout`](../scout/README.md), [`@luckys_luis/nuxt-laravelize-migrations-drizzle`](../migrations-drizzle/README.md).
