# Reliability Drizzle

Durable PostgreSQL, SQLite and Turso Outbox/Inbox stores. PostgreSQL claims use `FOR UPDATE SKIP LOCKED`; SQLite/Turso use one `UPDATE ... RETURNING` statement (serialize write transactions under contention). Pass the current Drizzle transaction to `appendWith(tx, envelope)` to bind an outbox append to the business transaction.
