# @nuxt-laravelize/workflows

A storage-portable, persisted **linear** workflow/saga engine. This initial release deliberately does not expose DAGs, signals, or parallel steps.

## Delivery and safety model

Handlers and compensations have **at-least-once invocation**. A worker can crash after an external effect but before committing its snapshot, so a later worker invokes the handler again with the same stable `idempotencyKey`. Handlers must make external effects idempotent (for example, pass that key to a payment provider or enforce it in the same transactional database). The engine does not and cannot promise exactly-once external effects.

Store writes are authoritative. An attempt-start transition is persisted before every handler or compensation invocation, and every result, retry deadline, cancellation, and state transition is persisted with a revision check. An interrupted `running` attempt is consumed and becomes a retry or terminal failure after its lease expires. Claims carry a unique lease token; commits require the claimed revision, token, an authoritative current time, and an unexpired lease, fencing stale workers. Long handlers renew only lease expiry without changing revision or `updatedAt`. A production store must implement all revision/lease operations atomically, including merging cooperative cancellation into commits and renewal.

Custom stores return authoritative receipts, but every persisted snapshot and receipt is validated. `create(created: true)` must return the exact requested snapshot; idempotent replay remains authoritative only for the same definition/start/input tuple. `claim` may change only `revision` (`+1`), `updatedAt` (the supplied `now`), and the requested lease. Renewal may only replace lease expiry, except for the exact concurrent cancellation race. Cancellation preserves state, steps, and lease while changing its flag, revision, and timestamp. `commit` must return the exact submitted identity, state, steps, and timestamp; revision is `+1`, except `+2` when atomically merging a concurrent false-to-true cancellation. A released lease must be absent. A retained lease must keep its token, remain unexpired, and may only extend its expiry. The manager rejects malformed state or receipt drift with `WorkflowStoreContractError` before invoking another effect or trusting cancellation. A rejected receipt cannot undo an accepted write in an external nontransactional store, so recovery may have to wait for its retained claim lease to expire.

`InMemoryWorkflowStore` is explicitly volatile and intended only for tests and local development.

Recovery discovery is an optional store capability, so existing custom `WorkflowStore` implementations remain compatible. `RecoverableWorkflowStore.discoverRecoverable()` returns cursor-paginated non-terminal IDs ordered by `(updatedAt, id)`. Every query requires an `updatedBefore` boundary so one scan remains finite while workflows change concurrently; a later scan discovers changes beyond that boundary. The in-memory store and official Drizzle stores implement this capability.

## Example

```ts
import { defineStep, defineWorkflow, InMemoryWorkflowStore, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'

const order = defineWorkflow({
  name: 'place-order', version: '1',
  steps: [defineStep({
    name: 'charge', maxAttempts: 3,
    run: ({ input, idempotencyKey }) => charge(input, idempotencyKey),
    compensate: ({ stepOutput, idempotencyKey }) => refund(stepOutput, idempotencyKey),
  })],
})
const registry = new WorkflowRegistry().register(order)
const manager = new WorkflowManager(new InMemoryWorkflowStore(), registry)
const started = await manager.start(order, { orderId: 'o-1' }, 'place-order:o-1')
await manager.run(started.id)
```

`startKey` is scoped to workflow name and version. Repeating a start with canonically identical JSON input returns the existing snapshot; different input throws `StartKeyConflictError`. Object key order does not affect canonical identity.

## Definition and snapshot versions

Definitions resolve by the exact, case-sensitive `(name, version)` tuple. Versions are opaque 1–64 character ASCII strings with alphanumeric ends and `[A-Za-z0-9._-]` interiors. `latest`, `default`, and `current` are reserved case-insensitively. There is no fallback, range, or latest resolution. Treat published tuples as immutable and assign a new version for any handler or step change. `WorkflowRegistry.versions(name)` returns registration order. Workflow and step names use the same bounded grammar. Registered definitions, step records, and step arrays are frozen; handler closures remain usable.

New snapshots carry the required source field `snapshotFormatVersion: 1`. `status(id)` is a diagnostic read: it normalizes a legacy missing field and rejects unknown formats without requiring the definition to be deployed. Execution additionally exact-resolves the definition, including for terminal or waiting snapshots, before mutation. Definition identity, input, and every stable step/idempotency identity are immutable after creation. A missing valid exact definition is an operational error: redeploy that historical definition; never fall back to another version.

For rolling deployments: (1) register old and new string versions together, (2) deploy that registry to APIs, workers, and reconcilers, and (3) switch new starts. Retain every historical version while any persisted row or outstanding queue job/wake can reference it. Before removal, either prove those references no longer exist or archive/delete terminal rows and drain/prune outstanding jobs/wakes under an explicit retention policy. Automatic or arbitrary in-flight definition migration is intentionally unsupported.

### Breaking persisted-row upgrade

The strict invariant audit must validate **every persisted row**, not only distinct identifiers. Before upgrading:

1. Stop every starter, worker, reconciler, and other workflow writer; take and verify a backup.
2. Validate each row with the new snapshot validator and the exact historical definition deployed for its case-sensitive `(workflowName, workflowVersion)` tuple. Audit relational/JSON identity and exact definition/step names; `createdAt <= updatedAt` and other timestamp monotonicity; workflow/step state and ordering; required outputs, errors, and `retryAt`; forward and compensation counters against that definition's deployed `maxAttempts`; lease token/expiry validity; and error name/message bounds (128/4096). Previous-release serialized error text is bounded safely during authoritative reads, but it must still be included in the audit.
3. Update relational columns and snapshot JSON atomically under an explicit reviewed mapping. Never trim, lowercase, re-pin, reorder, or otherwise silently normalize identity or state. Rows from untrusted/custom stores that violate state invariants require application-specific repair or archival; automatic in-flight migration remains unsupported.
4. Treat old race rows with `state IN ('completed', 'failed')` and `cancellationRequested = true` as incidents, not cleanup. Perform a business/incident review and either perform or verify the required compensation before marking the workflow `cancelled`/`compensated`, or explicitly document why cancellation was rejected before clearing the flag. **Never blindly clear it.**
5. Re-run the complete validator/definition audit as a dry run before deployment. Invalid historical tuples cannot be recreated through the strict API, so repair them before upgrade; “restore the old version” applies only to already-valid identifiers.

Missing `snapshotFormatVersion` remains readable as format 1 and may be backfilled. Unknown explicit formats must not be rewritten blindly. After the audit, dual-register old and new valid versions during rolling deployment, retaining every version while a persisted row or outstanding job/wake references it.

Call `process(id)` from a worker to perform at most one attempt, or `run(id)` for bounded local draining. Configure `leaseDurationMs` and a shorter `heartbeatIntervalMs`; every step and compensation receives `signal`. Heartbeats observe in-flight cancellation and abort forward work, while compensation continues. `process(id, { signal })` supports cooperative shutdown, and lease loss always discards stale results. Signals cannot undo accepted external effects and non-cooperative handlers may continue, so stable idempotency keys remain mandatory.
