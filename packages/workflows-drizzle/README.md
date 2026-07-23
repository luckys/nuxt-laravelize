# Workflows Drizzle

Durable `WorkflowStore` implementations for PostgreSQL, SQLite, and Turso. Claims/reclaims are a single conditional `UPDATE … RETURNING`; commits are fenced by revision, lease token, and lease expiry while preserving the workflow manager's one-revision concurrent-cancellation merge. `renewLease()` conditionally updates only lease expiry and never increments revision or changes `updatedAt`.

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

## Existing-row audit

Before rollout, stop all writers, back up the database, and validate every row—not only distinct identifiers—with the new validator and its exact historical definition. Audit relational/JSON identity, exact definition and step names, monotonic timestamps, state/step ordering, required outputs/errors/`retryAt`, retry and compensation counters against deployed `maxAttempts`, leases, and 128/4096 error bounds. Repair relational columns and snapshot JSON atomically, then rerun a dry validation before deployment. Invalid rows from custom/untrusted stores need application-specific repair or archival; automatic in-flight migration is unsupported. Missing `snapshotFormatVersion` is read as format 1 and may be backfilled; previous-release error strings are bounded on read. Neither compatibility behavior repairs other invariants or unknown explicit formats.

PostgreSQL discovery starting points (application-level validation remains authoritative):

```sql
-- Ambiguous old cancellation races: investigate each row; never blindly clear the flag.
SELECT id, state, cancellation_requested,
       snapshot ->> 'state' AS json_state,
       snapshot ->> 'cancellationRequested' AS json_cancellation_requested
FROM workflows
WHERE (state IN ('completed', 'failed') AND cancellation_requested = true)
   OR (snapshot ->> 'state' IN ('completed', 'failed')
       AND snapshot ->> 'cancellationRequested' = 'true');

-- Previous-release serialized error candidates requiring audit/backfill.
SELECT w.id, e.ordinality - 1 AS step_index, e.step ->> 'name' AS step_name,
       length(e.step #>> '{error,name}') AS error_name_length,
       length(e.step #>> '{error,message}') AS error_message_length
FROM workflows AS w
CROSS JOIN LATERAL jsonb_array_elements(w.snapshot -> 'steps') WITH ORDINALITY AS e(step, ordinality)
WHERE e.step ? 'error'
  AND (jsonb_typeof(e.step -> 'error' -> 'name') <> 'string'
    OR jsonb_typeof(e.step -> 'error' -> 'message') <> 'string'
    OR coalesce(length(e.step #>> '{error,name}'), 0) = 0
    OR length(e.step #>> '{error,name}') > 128
    OR length(e.step #>> '{error,message}') > 4096);
```

The SQL only discovers candidates. Export or stream every row through application code, compare every authoritative relational column with the snapshot JSON, and run `normalizePersistedWorkflowSnapshot` followed by `assertWorkflowSnapshotMatchesDefinition` using the exact deployed historical definition. Treat every rejection as migration work; do not infer validity from either query returning no rows.

For each `completed|failed + cancellationRequested` row, perform an incident/business review: either perform or verify compensation and mark it `cancelled`/`compensated`, or document an explicit cancellation rejection before clearing the flag. Apply the reviewed relational and JSON changes in one transaction.
