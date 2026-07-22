# Reliability Drizzle

Durable PostgreSQL, SQLite and Turso Outbox/Inbox stores. PostgreSQL claims use `FOR UPDATE SKIP LOCKED`; SQLite/Turso use one `UPDATE ... RETURNING` statement (serialize write transactions under contention). Pass the current Drizzle transaction to `appendWith(tx, envelope, { availableAt })` to bind an optionally scheduled outbox append to the business transaction. When using `@nuxt-laravelize/database`, `appendIn(unitOfWork, envelope, options)` uses that unit of work's exact transaction session; the existing `append` and `appendWith` APIs remain available.

`availableAt` controls the earliest claim time independently from the immutable envelope `occurredAt`. Duplicate IDs are accepted only when both the normalized envelope and availability are identical; conflicting reuse throws `OutboxMessageConflictError`.

Apply the dialect-specific append-availability migration (`0002` for PostgreSQL or `0003` for SQLite/Turso) after the original table migration. The immutable `append_available_at` column preserves duplicate identity when mutable `available_at` advances during retries.

Then apply the terminal-time migration (`0004` for PostgreSQL or `0005` for SQLite/Turso). `delivered()` and `dead()` record authoritative `terminal_at`; migrated legacy rows remain null and are not guessed or pruned automatically. `prune()` deletes at most `limit` rows matching namespace, terminal state, strict cutoff, and optional message types. Run bounded passes from cron or a scheduler. Default application policies should prune delivered rows first and retain dead rows until evidence is archived or explicitly expired.
