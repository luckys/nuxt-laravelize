# `@nuxt-laravelize/queue`

[Espanol](./README.es.md) | English

Portable queue contracts and in-memory driver for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/queue
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/queue'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Queue

`@nuxt-laravelize/queue` defines portable jobs and includes an in-memory queue. The Nitro auto-import `useQueue(event)` resolves the active driver.

```bash
pnpm add @nuxt-laravelize/queue
```

```ts
import { createToken, type Resolver } from '@nuxt-laravelize/core/runtime'
import { Job } from '@nuxt-laravelize/queue/runtime'

interface SendReportPayload extends Record<string, unknown> { reportId: string }
interface ReportService { send(reportId: string): Promise<void> }
const reportServiceToken = createToken<ReportService>('services.reports')

export class SendReport extends Job<SendReportPayload> {
  static readonly tries = 3
  static readonly queue = 'reports'
  static readonly backoff = [1_000, 5_000]
  static readonly priority = 10

  readonly payload: SendReportPayload

  constructor(payload: Record<string, unknown>) {
    super()
    if (typeof payload.reportId !== 'string') throw new Error('reportId is required')
    this.payload = { reportId: payload.reportId }
  }
  async handle(resolver: Resolver) {
    await resolver.make(reportServiceToken).send(this.payload.reportId)
  }
  tags() {
    return ['report:delivery']
  }
}
```

Register serialized jobs before a worker rehydrates them, then use the `Queue` contract.

```ts
registry.register(SendReport.name, SendReport)
await queue.push(new SendReport({ reportId: 'report_1' }))
await queue.later(60_000, new SendReport({ reportId: 'report_2' }))
await queue.sync(new SendReport({ reportId: 'report_3' }))
await queue.chain([
  { job: new SendReport({ reportId: 'report_4' }) },
  { job: new SendReport({ reportId: 'report_5' }), options: { queue: 'archive' } },
])
const batch = await queue.batch([
  { job: new SendReport({ reportId: 'report_6' }) },
  { job: new SendReport({ reportId: 'report_7' }), options: { tries: 3 } },
], { queue: 'reports' })
await queue.batchStatus(batch)
await queue.cancelBatch(batch)
```

| API | Purpose |
|---|---|
| `Job.serialize()` | Produces the versioned queue payload. Override `handle()` and optionally `failed()`. |
| `JobSerializer.serialize()` / `readJobDispatchIdentity()` | Snapshots JSON-safe payload data and adds a versioned dispatch ID with its canonical SHA-256 fingerprint. |
| `JobAdmissionMetadataContributorRegistry` | Registers synchronous final-admission metadata contributors shared by scoped serializers. |
| `Job.tags()` / `readJobTags()` | Declares bounded diagnostic tags and defensively reads their serialized snapshot. |
| `InMemoryJobRegistry.register()` | Maps a serialized job name to its constructor. |
| `InMemoryJobRegistry.rehydrate()` | Recreates a registered job or throws `JobNotRegisteredError`. |
| `JobRunner.run()` / `failed()` | Runs a serialized job and its failure hook in a scope. |
| `Queue.push()` / `later()` / `sync()` | Enqueues, delays or immediately executes a job. |
| `Queue.chain()` | Eagerly prepares a bounded linear chain and admits each successor only after the preceding step succeeds. |
| `Queue.batch()` / `batchStatus()` / `cancelBatch()` | Admits bounded independent same-queue children, reads fixed counters and requests cooperative cancellation. |
| `Queue.size()` / `clear()` | Inspects or clears all jobs, optionally by queue name. |
| `Queue.onFailed()` | Registers a terminal-failure observer. |
| `PushOptions` | Overrides `tries`, `delay`, `queue`, `backoff` and `priority`; `deduplication` suppresses matching queue-local admission. |
| `QueueFake` | Records admitted pushes, complete chains and testing-only batch records, including dispatch identity, effective priority and normalized tags. |
| `JobReleasedError` | Requests delayed replay without consuming the ordinary failure-attempt budget. Queue adapters handle it; application jobs should not use it as a business error. |

Jobs may declare up to 16 diagnostic tags with `tags()`. Each tag is a safe identifier of at most 128 characters, all declarations together are limited to 1024 characters, and duplicates are removed while preserving order. Tags are snapshotted into namespaced versioned metadata at serialization, so retries, delayed releases and dead-letter inspection see the same values. `readJobTags()` returns a frozen defensive copy and treats absent or malformed persisted tag metadata as no tags; producer serialization remains strict. Tags may appear in Redis job data, backups, failed-job tooling and operations dashboards. Never include credentials, tokens, email addresses, raw customer identifiers or unnecessary personal data. Tags are diagnostics only: they do not authorize tenant/principal access, fence effects, deduplicate admission or automatically become metric labels or trace attributes. Indexing and fleet-wide tag queries are intentionally not provided.

Every shared `JobSerializer` call creates a new opaque dispatch ID, validates and detaches a JSON-safe payload snapshot, and stores `sha256:<hex>` over a bounded canonical representation. Object keys are sorted while array order is preserved; accessors, sparse arrays, cycles, non-finite numbers, `bigint`, class instances and other values that queue transports cannot preserve consistently are rejected. The worker recomputes the fingerprint before scope contributors or middleware and classifies malformed or mismatched owned metadata as terminal `INVALID_JOB_DISPATCH`. Retries, delayed releases and failed hooks reuse the same serialized identity, while a separate push receives another ID. Legacy v1/v2 envelopes without this metadata remain executable. `fingerprintJobPayload()` and `readJobDispatchIdentity()` expose the same public contract, and `QueueFake.pushed` records both the detached envelope and identity.

Final-admission contributors run only through registry-backed `JobRunner` admission, which the built-in queue adapters use after resolving the actual queue and before broker insertion. They receive a frozen `JobAdmissionContextV1` containing that queue, effective serialized name, registry-canonical name and dispatch identity. Canonicalization also verifies that the serialized alias belongs to the dispatched constructor. Ordinary `JobSerializer.serialize()` never runs these contributors; `QueueFake` requires an injected registry-backed `JobRunner` when its serializer has admission contributors. Contributors are synchronous and their output remains bounded JSON-safe metadata. This boundary lets trusted application infrastructure sign already-final dispatch facts, but the queue package does not provide keys, KMS access or credential storage.

Dispatch identity is visible, unkeyed integrity metadata. A producer able to replace an envelope can replace both payload and fingerprint, so it does not authenticate the producer, actor, tenant, queue or job name; it provides no confidentiality, anti-replay, admission deduplication, fencing or exactly-once effects. Use authenticated delegation below when producer identity must cross this boundary. Applications must continue using durable idempotency for effects.

Priorities are queue-local scheduling hints from `0` through `2^21`. `0` is the ordinary unprioritized class and runs before positive priorities; among positive values, lower numbers run first. Equal priorities remain FIFO, delayed jobs compete only after becoming due, and running work is never preempted. `PushOptions.priority` overrides the job static. Retries and delayed middleware releases retain the resolved priority. Priority is transport metadata rather than part of the serialized job and does not provide fairness, uniqueness or exactly-once execution.

Admission deduplication is explicit and queue-local. Pass a safe opaque ID of at most 256 characters and optionally a TTL from 1 ms through 24 hours. `id` and `deduplication` are mutually exclusive because persistent BullMQ job IDs have a different lifetime. Without a TTL, matching pushes return the original handle until that job completes or fails; retries and middleware releases retain the reservation. With a TTL, suppression expires independently even if the original job is delayed or still running. `clear()` removes reservations for the cleared queue. BullMQ uses its atomic native primitive and stores a deterministic SHA-256-derived identifier instead of the supplied value; this key-safe derivation prevents injection and direct disclosure but is not confidentiality for predictable IDs. The in-memory driver and `QueueFake` provide process-local behavior only; because the fake does not execute jobs, its no-TTL reservations remain until `clear()`.

```ts
await queue.push(new SendReport({ reportId: 'report_1' }), {
  deduplication: { id: 'tenant-a.report-report_1', ttl: 30_000 },
})
```

Deduplication only reduces duplicate admission. It does not replace durable idempotency, tenant authorization or store fencing, and it cannot provide exactly-once effects across retries, crashes or acknowledgement ambiguity. The queue is not an authorization boundary: only trusted producer code may construct deduplication metadata, and that code must include a trusted tenant scope when identities can overlap. Never accept the complete identifier from an untrusted caller or place secrets or personal data in it. Replacement/debounce behavior is intentionally unsupported.

Sequential chains contain from 1 through 100 steps, at most 8000 JSON nodes, 24 levels and a maximum 240 KiB serialized envelope. Every step resolves its own queue, retries, delay, backoff and priority and passes independently through registry-backed final admission before the first broker mutation. Each step therefore receives a distinct dispatch identity, payload fingerprint and, when configured, delegation credential bound to its exact job and queue. Chain steps do not accept caller IDs or deduplication, and ordinary pushes cannot use the reserved `laravelize-chain-` job ID prefix. Only the first step is initially admitted; a successful step publishes the next one, while retries and delayed releases do not advance and terminal failure stops the chain. A versioned SHA-256 chain fingerprint and BullMQ transport checks detect accidental state corruption but are unkeyed and do not authenticate storage. `QueueFake.chains` records the complete prepared chain but only its first step in `pushed`.

The handoff is at-least-once, not transactional execution. BullMQ uses deterministic internal successor IDs to reduce duplicate broker admission when acknowledgement is ambiguous, but a crash or successor-publication outage can rerun the preceding handler, and there is no atomic cross-queue commit. Every handler still requires durable idempotency or fencing. BullMQ workers must be running for every queue named by the chain. Prepared future metadata is persisted with the current chain envelope; dead-letter payload inspection exposes only the current business payload and strips all serialized metadata, but storage operators can still access Redis data. Redis or broker write access is a trusted infrastructure boundary: an attacker with it can recompute unkeyed integrity metadata, inject exact replays or skip ordering while a credential remains valid. Use Redis ACLs/network isolation and application idempotency; this contract does not claim anti-replay. Long-running chains can outlive an eagerly issued delegation credential and then fail closed. Chains intentionally provide no branches, parallel fan-out, result passing, dynamic mutation, catch/finally steps, progress or cancellation; use explicit workflows for branching semantics and bounded batches for flat same-queue fan-out.

Bounded batches contain 1-100 flat children and select exactly one queue for the whole batch. Per-child options support tries, delay, backoff and priority, never queue, caller ID or deduplication. Every child is final-admitted before any adapter mutation with a distinct dispatch identity; the cumulative wrappers share the chain limits of 240 KiB, 8000 nodes and depth 24, use reserved deterministic internal IDs and versioned SHA-256 integrity checks. SHA-256 detects accidental corruption only: Redis/broker write access is a trusted infrastructure boundary whose writers can recompute wrappers or replay jobs. Snapshots expose only `total`, `pending`, `succeeded`, `failed`, `cancelled`, `cancellationRequested` and `running | cancelling | finished | cancelled`; counters always sum to total. Sibling terminal failures do not stop the batch, and retries/releases settle one counter only once. Handles are locators rather than authorization credentials; status and cancellation endpoints must enforce application ownership. Effects still require durable idempotency or fencing.

Cancellation is cooperative. Waiting and retried children check cancellation before effects, while an active child can resolve `queueBatchContextToken` and call `isCancellationRequested()` or `throwIfCancellationRequested()`. A confirmed cancellation control error neither retries nor invokes failed hooks or dead-letter reporting. Cancellation does not interrupt an already-running effect, roll it back or provide exactly-once execution. A final-completion race can leave `cancellationRequested: true`; terminal state remains `finished` when no child actually cancelled, otherwise `cancelled`. `InMemoryQueue` progress is process-local and volatile; `QueueFake` is testing-only and immediately marks all remaining children cancelled.

```ts
import { QueueFake } from '@nuxt-laravelize/queue/testing'

const queue = new QueueFake()
await queue.push(new SendReport({ reportId: 'report_1' }))
queue.assertPushed(SendReport)
```

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#queue). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/queue-bullmq`](../queue-bullmq/README.md), [`@nuxt-laravelize/queue-middleware`](../queue-middleware/README.md), [`@nuxt-laravelize/events-queue`](../events-queue/README.md).
