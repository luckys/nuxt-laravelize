---
'@nuxt-laravelize/workflows': major
'@nuxt-laravelize/workflows-drizzle': major
'@nuxt-laravelize/workflows-queue': major
'@nuxt-laravelize/workflows-reliability': major
'@nuxt-laravelize/database': major
'@nuxt-laravelize/database-drizzle': major
---

Require strict workflow/step identifiers, exact immutable definition resolution, and `snapshotFormatVersion` on source snapshots. Workers, queues, and recovery now fail closed when a definition is missing or a custom resolver returns a fallback; `WorkflowWakeReconciler` now requires a resolver.

Before deploying, stop every workflow writer, back up, and audit every persisted row—not only identifiers—with the new validator and exact historical definitions. The audit must cover relational/JSON identity and exact definition/step names, timestamp and state ordering, required outputs/errors/retry deadlines, counters versus deployed `maxAttempts`, leases, and error bounds. Repair relational columns and snapshot JSON atomically and rerun dry validation. Previous-release serialized errors are safely bounded only at authoritative reads; missing format remains format 1. Neither path repairs other invalid state. Custom/untrusted-store violations require application-specific repair/archive, and automatic in-flight migration remains unsupported.

Known old `completed|failed + cancellationRequested` races now throw `InvalidWorkflowSnapshotError`. Never clear the flag blindly: perform an incident/business review and either perform/verify compensation before marking `cancelled`/`compensated`, or explicitly document cancellation rejection before clearing it. After migration, dual-register old and new valid versions during rolling deployments and retain every referenced historical definition. The workflows-drizzle README provides PostgreSQL discovery queries.

Custom `TransactionManager` and `UnitOfWork` implementations must add the required `markRollbackOnly(reason?: unknown)` method and make the native transaction callback throw before commit whenever it is marked, including when application code caught the initiating failure. Rollback-only transactions must not run `afterCommit` hooks.
