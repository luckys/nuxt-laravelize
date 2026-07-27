# @nuxt-laravelize/migrations

ORM-neutral migrations with explicit dialect and source registration. A migration ID is always `namespace:name`; sources are passed directly to `MigrationRunner` (there is no `node_modules` scanning).

The runner validates every dependency, cycle, dialect, duplicate, applied record, and checksum before mutating state. Every mutating operation selects against history inside `MigrationBackend.withLockedTransaction`; migration SQL and matching history writes use the callback's transaction-bound unit and commit atomically. `rollback`/`reset` determine reversibility only after taking that lock. `fresh` requires an explicit ownership manifest and never infers database ownership.

Use `plan()`, `status()`, `up()`, `rollback()`, `reset()`, `fresh()`, or pass `{ pretend: true }` to mutating operations. `discoverApplicationMigrations()` accepts only caller-supplied paths/glob results and an importer. It performs no filesystem or dependency scanning.

`@nuxt-laravelize/migrations/console` exports six `migrate:*` definitions and their DI bindings. Register both with the console runtime. Rollback, reset, and fresh require affirmative interactive confirmation; non-interactive/destructive execution fails closed. Fakes are exported from `@nuxt-laravelize/migrations/testing`.
