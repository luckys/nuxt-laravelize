# @nuxt-laravelize/idempotency-drizzle

Durable PostgreSQL, SQLite, and Turso implementations of `IdempotencyStore`.

```ts
import { DrizzlePostgresIdempotencyStore } from '@nuxt-laravelize/idempotency-drizzle/postgres'
const store = new DrizzlePostgresIdempotencyStore(db)

import { DrizzleSQLiteIdempotencyStore } from '@nuxt-laravelize/idempotency-drizzle/sqlite'
const sqliteStore = new DrizzleSQLiteIdempotencyStore(sqliteDb)
```

Apply the matching SQL file from `migrations/` before use. Schema objects are exported from `./schema` (PostgreSQL) and `./sqlite-schema` (SQLite/Turso); migration files are exported as `./migrations/postgres` and `./migrations/sqlite`.

The PostgreSQL constructor accepts an actual Drizzle PostgreSQL database with `execute(SQL)`. The SQLite and Turso constructors accept an actual Drizzle SQLite database with `all(SQL)`. Both methods may return synchronously or through a `PromiseLike`; PostgreSQL may return either a row array or `{ rows }`, while SQLite/Turso `all` returns the row array.

All timestamps and durations are non-negative safe integers in epoch milliseconds. Acquisition is one atomic `UPSERT … RETURNING`; guarded mutations use `UPDATE … RETURNING`, are fenced by state, token, and an unexpired lease, and derive success only from the returned row count.

Structural tests render every statement with both Drizzle dialects and enforce the exact `execute`/`all` boundaries. A native SQLite integration test is only run when an existing compatible driver is available; this package does not install one.
