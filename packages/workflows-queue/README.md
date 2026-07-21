# @nuxt-laravelize/workflows-queue

Runs `@nuxt-laravelize/workflows` through Laravelize Queue. Bind `workflowStoreToken` to a durable store in an application service provider, then register definitions through `workflowRegistryToken`. This module intentionally never installs the process-local `InMemoryWorkflowStore`.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/workflows-queue'],
  laravelizeWorkflowsQueue: { queue: 'workflows', tries: 5, backoff: 5000 },
})
```

Use `useWorkflows(event).start(definition, input, startKey)` to persist and publish a workflow. Persistence and queue publication are two separate operations: a process crash after persistence but before publication can leave a non-terminal workflow without a job. This module does not claim transactional-outbox guarantees.

Applications should run a recovery scanner against their durable store's non-terminal workflow index and pass known IDs to `coordinator.reconcile(ids)`. The result reports `scheduled`, terminal `skipped`, and `failed` IDs. `enqueue(id)` is the lower-level recovery operation and continues to throw publication errors.

## Delivery semantics

The workflow store is authoritative; queue payloads contain only a workflow ID. Every worker reloads current state and performs at most one transition. Deterministic IDs per workflow revision are only a transport deduplication optimization. Correctness does not depend on queue deduplication: duplicate or stale jobs are harmless because authoritative store revisions and leases fence concurrent claims. Step effects must honor the supplied idempotency key.

Business retry deadlines are scheduled as delayed successor jobs and do not fail a queue attempt. Queue publication and transport failures throw and use the configured queue `tries`/`backoff`. Long business waits are rechecked in chunks of `maxDelayMs`; lease contention is retried after `contentionDelayMs`.
