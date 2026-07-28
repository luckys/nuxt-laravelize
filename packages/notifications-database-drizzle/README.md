# @nuxt-laravelize/notifications-database-drizzle

Durable PostgreSQL and SQLite/Turso Drizzle-compatible stores for `@nuxt-laravelize/notifications-database`.

```bash
pnpm add @nuxt-laravelize/notifications-database-drizzle drizzle-orm
```

Bind `DrizzlePostgresDatabaseNotificationStore` or `DrizzleSQLiteDatabaseNotificationStore` to `databaseNotificationStoreToken` in an application service provider. SQLite-compatible Drizzle clients include local SQLite and Turso/libSQL.

Run the owned migrations through `@nuxt-laravelize/migrations-drizzle` aggregate sources or import `migrationSourceFor()` from `@nuxt-laravelize/notifications-database-drizzle/migrations`.

The schema uses tenant-scoped primary keys, recipient-scoped cursor indexes, JSON validity checks, read timestamp constraints, and parameterized writes. Idempotent retries compare immutable fingerprints and fail closed on conflicting content.
