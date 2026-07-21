# Workflows Drizzle

Durable `WorkflowStore` implementations for PostgreSQL, SQLite, and Turso. Claims/reclaims are a single conditional `UPDATE … RETURNING`; commits are fenced by revision, lease token, and lease expiry while preserving the workflow manager's one-revision concurrent-cancellation merge.

```ts
import { DrizzlePostgresWorkflowStore } from '@nuxt-laravelize/workflows-drizzle/postgres'

const store = new DrizzlePostgresWorkflowStore(drizzleDatabase)
```

The PostgreSQL constructor accepts a structural Drizzle-compatible source with `execute(SQL)`. Its result may be synchronous or `PromiseLike` and must use PostgreSQL's row result shape (`{ rows: [...] }`; direct row arrays are also normalized).

`DrizzleSQLiteWorkflowStore` from `/sqlite` accepts the actual Drizzle SQLite query boundary, `all(SQL)`, returning a row array synchronously or through a `PromiseLike`. `TursoWorkflowStore` from `/turso` accepts the same asynchronous-capable `all(SQL)` API used by Drizzle libSQL/Turso databases. An `execute(SQL)`-only object is intentionally not accepted by either SQLite constructor.

## Schema and migrations

- PostgreSQL schema: `@nuxt-laravelize/workflows-drizzle/schema`
- SQLite/Turso schema: `@nuxt-laravelize/workflows-drizzle/sqlite-schema`
- PostgreSQL migration: `@nuxt-laravelize/workflows-drizzle/migrations/postgres.sql`
- SQLite/Turso migration: `@nuxt-laravelize/workflows-drizzle/migrations/sqlite.sql`

Apply exactly one migration for the selected database. Times are integer epoch milliseconds and must remain within JavaScript's safe-integer range. The relational identity, state, revision, cancellation, lease, and timestamp columns are authoritative when snapshots are hydrated.

Commits verify that `canonicalInput` is the canonical representation of `input` and condition the write on the originally persisted canonical input, preventing workflow input mutation. Snapshot values must contain only finite JSON primitives, arrays, and plain objects.

Structural tests render every query with Drizzle's PostgreSQL and synchronous/asynchronous SQLite dialects. A real SQLite integration test is not currently included because this workspace has no already-installed SQLite driver; no dependency is installed by this package's test setup.
