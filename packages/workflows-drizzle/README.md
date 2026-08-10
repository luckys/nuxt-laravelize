# `@luckys_luis/nuxt-laravelize-workflows-drizzle`

[Espanol](./README.es.md) | English

Durable Drizzle workflow stores for PostgreSQL, SQLite and Turso

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-workflows-drizzle @luckys_luis/nuxt-laravelize-workflows drizzle-orm
```

## Package-specific usage


### Persist workflows with a Drizzle store

Use the dialect-specific store and migration, then pass it to `WorkflowManager`. Relational revision, cancellation, and lease columns are authoritative during hydration and stale workers are fenced by conditional writes.

```ts
import { DrizzlePostgresWorkflowStore } from '@luckys_luis/nuxt-laravelize-workflows-drizzle/postgres'
import { WorkflowManager } from '@luckys_luis/nuxt-laravelize-workflows'

const store = new DrizzlePostgresWorkflowStore(db)
const workflows = new WorkflowManager(store, registry)
const started = await workflows.start(definition, { orderId }, 'orders:42')
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./postgres` | Public entrypoint for this package. |
| `./sqlite` | Public entrypoint for this package. |
| `./turso` | Public entrypoint for this package. |
| `./schema` | Public entrypoint for this package. |
| `./sqlite-schema` | Public entrypoint for this package. |
| `./migrations` | Public entrypoint for this package. |
| `./migrations/postgres.sql` | Public entrypoint for this package. |
| `./migrations/sqlite.sql` | Public entrypoint for this package. |

## Workflows and sagas

`@luckys_luis/nuxt-laravelize-workflows` implements persisted, linear workflows with versioned definitions, fenced renewable leases, retries, restart-safe attempts, cooperative in-flight cancellation, and reverse-order compensation.

Versions are opaque, case-sensitive strings of 1–64 ASCII characters, with alphanumeric ends and `[A-Za-z0-9._-]` interiors; `latest`, `default`, and `current` are reserved case-insensitively. Resolution is exact, without fallback, latest aliases, or ranges. Never change handlers or steps under a published tuple; assign a new version. New source snapshots require `snapshotFormatVersion: 1`. Diagnostic `status` normalizes a legacy missing field and rejects unknown formats without requiring a deployed definition; execution exact-resolves even terminal/waiting rows before claim or mutation.

This persisted-row validation is breaking. Before upgrade, stop every workflow writer and take a verified backup. Audit **every row**, not only identifiers, with the new validator and exact historical definitions: relational/JSON identity and exact definition/step names; timestamp monotonicity; workflow/step ordering; required outputs, errors, and `retryAt`; retry/compensation counters versus deployed `maxAttempts`; lease validity; and 128/4096 error bounds. Previous-release error strings are bounded on authoritative reads and missing JSON format remains format 1, but neither compatibility path repairs any other invariant. Migrate relational columns and snapshot JSON atomically from an explicit reviewed mapping, then rerun dry validation. Rows from custom/untrusted stores need application-specific repair or archival; automatic in-flight migration remains unsupported.

Old `completed|failed + cancellationRequested` race rows are explicitly rejected and must not be silently normalized. Review each incident and either perform/verify compensation before marking `cancelled`/`compensated`, or document rejection of cancellation before clearing the flag; never blindly clear it. The workflows-drizzle README includes PostgreSQL discovery queries. After repair, dual-register old and new valid definitions everywhere and retain historical versions while any row or outstanding queue job/wake references them.

```ts
const fulfill = defineWorkflow({
  name: 'orders.fulfill',
  version: '1',
  steps: [
    defineStep({ name: 'reserve', run: reserve, compensate: release }),
    defineStep({ name: 'charge', run: charge, compensate: refund }),
  ],
})

registry.register(fulfill)
const started = await workflows.start(fulfill, { orderId }, orderId)
await workflows.run(started.id)
```

The included in-memory store is volatile and intended for tests or local development. Production stores must implement atomic revision and lease fencing, including `renewLease()`. Configure `leaseDurationMs` and a shorter `heartbeatIntervalMs`; handler contexts receive `signal`, cancellation is observed at heartbeat cadence, and stale results are discarded after lease loss. Signals cannot undo accepted external effects, so handlers remain at-least-once and require stable idempotency keys.

`@luckys_luis/nuxt-laravelize-workflows-drizzle` supplies durable PostgreSQL, SQLite, and Turso stores. Workflow identity and canonical input are immutable; relational revision, cancellation and lease columns override serialized snapshots during hydration. Claims and commits are conditional row-returning statements, and stale or expired owners are fenced before state can be persisted. These stores also implement the optional `RecoverableWorkflowStore` capability, returning non-terminal IDs in bounded `(updatedAt, id)` cursor pages.

```ts
import { DrizzlePostgresWorkflowStore } from '@luckys_luis/nuxt-laravelize-workflows-drizzle/postgres'

const workflows = new WorkflowManager(new DrizzlePostgresWorkflowStore(db), registry)
```

### Transactional outbox wake-ups

`@luckys_luis/nuxt-laravelize-workflows-reliability` atomically records each workflow mutation and its future wake-up in the reliability outbox. Atomicity requires the workflow adapter, outbox adapter, and `TransactionManager` to use the same physical database transaction and connection.

```ts
const workflowStore = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(workflowStore, registry)
registerWorkflowWakeHandler(reliableHandlers, workflows)
```

The registration helper owns the wake-up message type and version while accepting any structurally compatible reliability registry; it forwards the reliability execution signal without coupling persistence to a queue transport. Creation emits an immediate wake-up. Every claim and renewal records a fallback at lease expiry, released non-terminal commits emit at once or at their retry deadline, and cancellation emits immediately. Renewal and replacement fallback share one transaction and do not change workflow revision.

To join an existing domain transaction, call `workflows.using(workflowStore.in(unitOfWork)).start(...)`. This writes domain state, workflow state, and outbox wake-up together without opening a nested transaction. Never wrap all of `processResult()` in one transaction: handlers may perform slow external effects between the engine's persisted boundaries. External effects remain at least once and still require their stable idempotency keys.

Run `new WorkflowWakeReconciler(durableWorkflowStore, durableReliabilityStore, { resolver: registry }).reconcileStore({ pageSize: 100 })` periodically to repair dead or operationally lost wake-ups. The exact resolver is required and must match workers. The bounded scan reloads authoritative state and schedules after any active lease or business retry deadline. Repeated and concurrent scans of an unchanged workflow share one deterministic wake per 60-second generation; configure `generationMs` when a different recovery-latency bound is required. Later generations use fresh IDs, so recovery never revives or mutates an old dead row. Use `reconcile(ids)` with an application-owned index. Per-workflow failures are returned without aborting later pages.

For a long-lived process, `new WorkflowWakeReconciliationWorker(reconciler, { intervalMs: 60_000, reconcile: { pageSize: 100 }, onResult })` runs immediately and then waits after each completed scan. It coalesces overlapping local calls and drains an active scan on abort. Per-workflow failures are reported through `onResult`; discovery and callback errors stop the loop. Deterministic IDs keep multiple processes safe, although a single leader avoids redundant scans.

Deploy it with `workflow-wake-reconcile --config ./workflow-wake-reconciliation.config.js`, or add `--once` for cron. The ESM config must default-export `{ worker, close? }`; `close` runs only after active reconciliation drains. The default config path is `workflow-wake-reconciliation.config.js` in the current directory. Signals trigger one graceful shutdown, while configuration, discovery, callback, drain, and cleanup errors exit non-zero.

When the same outbox contains other protocols, configure the dedicated `OutboxProcessor` with `types: [workflowWakeMessageType]`. Type-filtered claiming prevents a workflow queue delivery adapter from racing webhook or unrelated message workers.

Run `DATABASE_URL=postgresql://... pnpm test:integration:postgres` to execute the required real-PostgreSQL proof in an isolated temporary schema. It verifies joint commit, rollback on outbox failure, caller-owned rollback across domain, workflow, and outbox rows, and fresh recovery while retaining the dead row. The target fails when `DATABASE_URL` is absent rather than silently skipping.

### Queue scheduling

`@luckys_luis/nuxt-laravelize-workflows-queue` schedules one authoritative workflow transition per queue job. Payloads contain only the workflow ID; workers reload the store and claim by revision and lease. Business retry deadlines create delayed successor jobs, while queue retries are reserved for transport, store, and publication failures.

```ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-workflows-queue'],
  laravelizeWorkflowsQueue: { queue: 'workflows', tries: 5, backoff: 5000 },
})

await useWorkflows(event).start(fulfill, { orderId }, orderId)

// Run periodically from your scheduler or operational worker.
await useWorkflows(event).reconcileStore({ pageSize: 100 })
```

Bind `workflowStoreToken` to a durable store and register definitions through `workflowRegistryToken`. Deterministic revision-based job IDs optimize transport deduplication, but correctness relies on store fencing, so duplicate jobs remain harmless. Persistence and publication are separate operations: run `reconcileStore()` periodically when the store supports recovery discovery, or call `reconcile(ids)` with IDs from a custom index. Every store scan captures an `updatedBefore` boundary so concurrent updates cannot make one pass unbounded; later passes pick up newer changes. This bridge does not claim transactional-outbox guarantees.

Queue and wake payloads remain ID-only so old jobs reload the relationally authoritative tuple rather than carrying stale or attacker-controlled version metadata. Enqueue/reconciliation preflight exact definitions and continue after reporting unsupported IDs; handlers independently fail closed before claim. Wake reconcilers require `{ resolver: registry }`, using the same registry as workers.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#workflows-and-sagas). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-workflows`](../workflows/README.md), [`@luckys_luis/nuxt-laravelize-migrations-drizzle`](../migrations-drizzle/README.md).
