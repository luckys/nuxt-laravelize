# @nuxt-laravelize/migrations-drizzle

Dependency-light migration backends for raw PostgreSQL/Drizzle and SQLite/Drizzle-shaped clients. PostgreSQL requires an explicit connection provider with `acquire()`/`release()` and uses the acquired dedicated session for advisory locking, migration SQL, history writes, and the surrounding transaction. An ambiguous pool-level `query()` facade is not accepted. SQLite uses `transaction(..., { behavior: 'immediate' })` and passes a callback-local unit to the runner; no transaction client is stored on the backend.

Both adapters create a SQL history table lazily. `fresh()` drops only objects in the runner's explicit ownership manifest; adapter history/lock tables are protected metadata and must not appear in that manifest. An optional `ownershipPrefix` is a second fail-closed guard and is recommended for test databases. `createTestNamespace()` produces validated per-test table prefixes and ownership helpers.

`migrationSourcesFor('postgresql' | 'sqlite')` from `./migrations` (also available from `./sources` and the package root) returns the explicit ordered migration sources for audit, idempotency, reliability, Scout, and workflows. The aggregate is static and performs no package or filesystem discovery.

The client interfaces are structural and require no runtime Drizzle dependency. SQL schemas are also available at `./migrations/postgresql.sql` and `./migrations/sqlite.sql`.
