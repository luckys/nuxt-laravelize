# @nuxt-laravelize/workflows-reliability

Atomically records workflow state mutations and future wake-ups in the Laravelize reliability outbox. The workflow row and outbox row are atomic only when `TransactionManager`, `storeForSession`, and `appendIn` use the same physical database transaction and connection.

```ts
const store = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(store, registry)
```

Each newly created workflow receives an immediate wake-up. Claims receive a lease-expiry fallback, released non-terminal commits receive an immediate or retry-deadline wake-up, and cancellations receive an immediate wake-up. Attempt-start commits that retain a lease and terminal commits emit nothing. Delivery is at least once and payloads contain only `workflowId`; the workflow store remains authoritative.

Register `createWorkflowWakeHandler(workflows)` for `workflowWakeMessageType` version `1` in the reliability queue handler registry. Recovery discovery remains necessary for dead-letter repair and operational reconciliation.

Use `workflows.using(store.in(unitOfWork))` to atomically start a workflow inside an existing domain transaction without opening a nested transaction. Never wrap `processResult()` as one large transaction because workflow handlers may perform slow external effects between persisted boundaries.
