# @nuxt-laravelize/workflows-queue

Runs `@nuxt-laravelize/workflows` through Laravelize Queue. Bind `workflowStoreToken` to a durable store in an application service provider, then register definitions through `workflowRegistryToken`. This module intentionally never installs the process-local `InMemoryWorkflowStore`.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/workflows-queue'],
  laravelizeWorkflowsQueue: { queue: 'workflows', tries: 5, backoff: 5000 },
})
```

Use `useWorkflows(event).start(definition, input, startKey)` to persist and publish a workflow. Persistence and queue publication are two separate operations: a process crash after persistence but before publication can leave a non-terminal workflow without a job. This module does not claim transactional-outbox guarantees.

Official workflow stores expose paginated recovery discovery, so applications can run `coordinator.reconcileStore({ pageSize: 100 })`. Each pass captures an `updatedBefore` boundary and terminates even while workflows change concurrently; run it periodically to include later changes. Custom stores can implement `RecoverableWorkflowStore`, or pass known IDs directly to `coordinator.reconcile(ids)`. Results report `scheduled`, terminal-race `skipped`, and `failed` IDs. `enqueue(id)` is the lower-level recovery operation and continues to throw publication errors.

## Delivery semantics

The workflow store is authoritative; queue payloads contain only a workflow ID. Every worker reloads current state and performs at most one transition. Deterministic IDs per workflow revision are only a transport deduplication optimization. Correctness does not depend on queue deduplication: duplicate or stale jobs are harmless because authoritative store revisions and leases fence concurrent claims. Step effects must honor the supplied idempotency key.

Enqueue and reconciliation resolve the snapshot's exact definition before publishing and report unsupported rows without stopping later rows/pages. Version is deliberately absent from queue payloads: an ID-only old job reloads the authoritative row, avoiding stale transport metadata and preventing payload tampering from selecting executable code. Workers also fail closed before claim. Retain a definition version while any persisted row or outstanding job can reference it; remove it only after references are gone, or after terminal rows are archived/deleted and jobs are drained/pruned under policy.

Business retry deadlines are scheduled as delayed successor jobs and do not fail a queue attempt. Queue publication and transport failures throw and use the configured queue `tries`/`backoff`. Long business waits are rechecked in chunks of `maxDelayMs`; lease contention is retried after `contentionDelayMs`.
