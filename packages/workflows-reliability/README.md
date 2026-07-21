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

Call `registerWorkflowWakeHandler(reliableHandlers, workflows)` to register the wake-up protocol in a compatible reliability handler registry. The helper owns the message type and version tuple without coupling this package to a queue transport. Recovery discovery remains necessary for dead-letter repair and operational reconciliation.

Use `workflows.using(store.in(unitOfWork))` to atomically start a workflow inside an existing domain transaction without opening a nested transaction. Never wrap `processResult()` as one large transaction because workflow handlers may perform slow external effects between persisted boundaries.

## PostgreSQL transaction proof

Run the real-adapter integration suite against an isolated schema in an existing PostgreSQL database:

```bash
DATABASE_URL=postgresql://... pnpm test:integration:postgres
```

The target requires `DATABASE_URL` and never silently skips. It applies the workflow and reliability migrations in a unique temporary schema, then proves successful joint commit, rollback when outbox append fails, and rollback of domain, workflow, and outbox rows in a caller-owned transaction.
