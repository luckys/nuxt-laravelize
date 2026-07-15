# @nuxt-laravelize/scout-drizzle

Explicit Scout engines for PostgreSQL (`/postgres`), local Drizzle SQLite (`/sqlite`), and Turso/libSQL (`/turso`). The root export remains PostgreSQL-compatible.

Apply `migrations/0000_create_scout_documents.sql` for PostgreSQL or the FTS5 migration `migrations/0001_create_scout_documents_sqlite.sql` for SQLite/libSQL. Bind the chosen engine with `new ScoutManager(engine)`. Filter and sort fields are deny-by-default, values are parameterized, and batch writes use explicit Drizzle transactions or transactional libSQL write batches. Install only the optional driver for your selected dialect (`postgres`, `better-sqlite3`, or `@libsql/client`).
