# @nuxt-laravelize/scout-drizzle

Explicit Scout engines for PostgreSQL (`/postgres`), local Drizzle SQLite (`/sqlite`), and Turso/libSQL (`/turso`). The root export remains PostgreSQL-compatible.

Apply `migrations/0000_create_scout_documents.sql` for PostgreSQL or the FTS5 migration `migrations/0001_create_scout_documents_sqlite.sql` for SQLite/libSQL. Register a lazy named driver with `registerDrizzlePostgresDriver`, `registerDrizzleSQLiteDriver`, or `registerTursoDriver`, then select it on `ScoutManager`. Filter and sort fields are deny-by-default, values are parameterized, and batch writes use explicit Drizzle transactions or transactional libSQL write batches. Install only the optional driver for your selected dialect (`postgres`, `better-sqlite3`, or `@libsql/client`).

```ts
import { registerDrizzlePostgresDriver } from '@nuxt-laravelize/scout-drizzle/postgres'
import { registerDrizzleSQLiteDriver } from '@nuxt-laravelize/scout-drizzle/sqlite'
import { registerTursoDriver } from '@nuxt-laravelize/scout-drizzle/turso'

registerDrizzlePostgresDriver(scout, 'postgres', postgresDb, allowlists)
registerDrizzleSQLiteDriver(scout, 'sqlite', sqliteDb, allowlists)
registerTursoDriver(scout, 'turso', tursoClient, allowlists)
scout.use('turso')
```

SQLite and libSQL deployments must provide FTS5 and JSON1. Apply the matching migration before indexing documents. Authorization remains an application responsibility; do not index secrets or personal data that search results should not expose.
