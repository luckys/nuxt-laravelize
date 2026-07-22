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

Each newly created workflow receives an immediate wake-up. Claims and every successful lease renewal atomically receive a lease-expiry fallback, released non-terminal commits receive an immediate or retry-deadline wake-up, and cancellations receive an immediate wake-up. Heartbeats therefore add workflow and outbox writes; retain/prune delivered wakes accordingly. Delivery is at least once and payloads contain only `workflowId`; the workflow store remains authoritative.

Call `registerWorkflowWakeHandler(reliableHandlers, workflows)` to register the wake-up protocol in a compatible reliability handler registry. The helper owns the message type and version tuple without coupling this package to a queue transport, and forwards the reliability execution signal for cooperative shutdown.

Use `workflows.using(store.in(unitOfWork))` to atomically start a workflow inside an existing domain transaction without opening a nested transaction. Never wrap `processResult()` as one large transaction because workflow handlers may perform slow external effects between persisted boundaries.

## Recovery

Run bounded reconciliation periodically to repair dead or operationally lost wake-ups:

```ts
const reconciler = new WorkflowWakeReconciler(durableWorkflowStore, durableReliabilityStore)
const result = await reconciler.reconcileStore({ pageSize: 100 })

const worker = new WorkflowWakeReconciliationWorker(reconciler, {
  intervalMs: 60_000,
  reconcile: { pageSize: 100 },
  onResult: result => metrics.record(result),
})
await worker.run(shutdownSignal)
```

Recovery reloads authoritative workflow state and appends a wake scheduled after any active lease or business retry deadline. Unchanged workflows share one deterministic wake per 60-second generation, so repeated or concurrent scans remain bounded; configure `generationMs` to match the required recovery latency. A later generation uses a fresh ID and therefore never mutates or revives an old dead row. Per-workflow failures are reported without aborting later pages. Use `reconcile(ids)` when discovery comes from an application-owned index. A custom reconciler `idFactory` must remain deterministic for the supplied snapshot and generation to preserve deduplication.

The worker runs one scan immediately and waits `intervalMs` after each completed scan. Overlapping `run()` and `runOnce()` calls are coalesced within the process. Abort interrupts the wait but not an active database scan; shutdown drains that scan. Per-workflow failures remain in `onResult`, while discovery or callback errors stop the loop. Multiple processes remain safe through deterministic wake IDs but still duplicate scans, so normally run one leader unless redundant scanning is intentional.

Run it as a supervised process with `workflow-wake-reconcile --config ./workflow-wake-reconciliation.config.js`, or add `--once` for cron. The ESM config must default-export `{ worker, close? }`, where `worker` is configured above and `close` releases resources after active work drains. Without `--config`, the command loads `workflow-wake-reconciliation.config.js` from the current directory. `SIGINT` and `SIGTERM` trigger graceful shutdown once. Per-workflow failures remain observable through `onResult`; configuration, discovery, callback, drain, and cleanup errors produce a non-zero exit.

Dedicated outbox workers must claim only workflow wake messages when the outbox contains other protocols:

```ts
new OutboxProcessor(reliabilityStore, createQueueOutboxDelivery(queue), {
  owner: process.env.OUTBOX_WORKER_ID!,
  types: [workflowWakeMessageType],
})
```

## PostgreSQL transaction proof

Run the real-adapter integration suite against an isolated schema in an existing PostgreSQL database:

```bash
DATABASE_URL=postgresql://... pnpm test:integration:postgres
```

The target requires `DATABASE_URL` and never silently skips. It applies the workflow and reliability migrations in a unique temporary schema, then proves successful joint commit, rollback when outbox append fails, rollback of domain, workflow, and outbox rows in a caller-owned transaction, and fresh recovery while preserving the original dead row.
