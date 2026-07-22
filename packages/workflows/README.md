# @nuxt-laravelize/workflows

A storage-portable, persisted **linear** workflow/saga engine. This initial release deliberately does not expose DAGs, signals, or parallel steps.

## Delivery and safety model

Handlers and compensations have **at-least-once invocation**. A worker can crash after an external effect but before committing its snapshot, so a later worker invokes the handler again with the same stable `idempotencyKey`. Handlers must make external effects idempotent (for example, pass that key to a payment provider or enforce it in the same transactional database). The engine does not and cannot promise exactly-once external effects.

Store writes are authoritative. An attempt-start transition is persisted before every handler or compensation invocation, and every result, retry deadline, cancellation, and state transition is persisted with a revision check. An interrupted `running` attempt is consumed and becomes a retry or terminal failure after its lease expires. Claims carry a unique lease token; commits require the claimed revision, token, an authoritative current time, and an unexpired lease, fencing stale workers. Long handlers renew only lease expiry without changing revision or `updatedAt`. A production store must implement all revision/lease operations atomically, including merging cooperative cancellation into commits and renewal.

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

Call `process(id)` from a worker to perform at most one attempt, or `run(id)` for bounded local draining. Configure `leaseDurationMs` and a shorter `heartbeatIntervalMs`; every step and compensation receives `signal`. Heartbeats observe in-flight cancellation and abort forward work, while compensation continues. `process(id, { signal })` supports cooperative shutdown, and lease loss always discards stale results. Signals cannot undo accepted external effects and non-cooperative handlers may continue, so stable idempotency keys remain mandatory.
