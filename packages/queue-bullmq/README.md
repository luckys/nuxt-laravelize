# `@luckys_luis/nuxt-laravelize-queue-bullmq`

[Espanol](./README.es.md) | English

Node-only BullMQ driver and worker for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-queue-bullmq @luckys_luis/nuxt-laravelize-queue bullmq ioredis
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-queue-bullmq'],
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

## BullMQ adapter

`@luckys_luis/nuxt-laravelize-queue-bullmq` is an optional Node-only persistent driver; the preset and reliability queue bridge do not install it. Install it with the portable queue and provide an `ioredis` client.

```bash
pnpm add @luckys_luis/nuxt-laravelize-queue @luckys_luis/nuxt-laravelize-queue-bullmq bullmq ioredis
```

```ts
import Redis from 'ioredis'
import { BullMQConnection, BullMQQueue, BullMQWorker } from '@luckys_luis/nuxt-laravelize-queue-bullmq/runtime'
import { jobSerializerToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'

const prefix = process.env.QUEUE_PREFIX
if (!prefix) throw new Error('QUEUE_PREFIX is required')
const connection = new BullMQConnection(new Redis(process.env.REDIS_URL!), {
  prefix,
})
const queue = new BullMQQueue(connection, runner, container.make(jobSerializerToken))
const worker = new BullMQWorker(connection, registry, runner)

await queue.push(new SendReport({ reportId: 'report_1' }))
await worker.work('reports', 4)
// During graceful shutdown:
await worker.stop()
await queue.close()
```

BullMQ batches are one atomic flat same-queue flow with a retained hidden coordinator parent. Children ignore sibling dependency failures, and the coordinator never enters the application registry or failure hooks. Status loads the complete BullMQ dependency sets, rejects unsuccessful `failed` dependencies, and verifies that processed, ignored and unprocessed keys are disjoint and exactly match all deterministic children; processed return values distinguish success from cancellation and ignored dependencies are failures. Coordinator cancellation state is strictly validated and fingerprinted. BullMQ lazy auto-removal thresholds are 24 hours/1000 completed jobs for coordinators and children, and 7 days/1000 failed jobs for children. Pruning occurs only on later terminal transitions, so idle queues may retain data beyond those ages; hard deletion deadlines require explicit scheduled cleanup. Counts remain bounded lazily according to BullMQ behavior. `batchStatus()` works only while the coordinator remains retained, and retention is not permanent or audit history. Dead-letter inspection exposes only the failed child business payload. Retrying failed batch children through `BullMQDeadLetterAdapter.retry()` is intentionally unsupported because BullMQ 5.77.3 cannot safely retry `ignoreDependencyOnFailure` children; admit a fresh standalone job or batch with a new final-admission identity and application idempotency. Cross-queue batches, branches/nesting/DAGs, dynamic children, fail-fast, results, callbacks, compensation/rollback, exactly-once effects and permanent history are intentionally unsupported.

`worker.stop()` is idempotent: the first call prevents new `work()` registrations, stops intake on every registered BullMQ worker, waits for active jobs and terminal failure reporting, and attempts every worker close even if one fails. Waiting and delayed jobs remain in Redis for another worker; draining never clears the queue. The drain has no built-in deadline because force-closing can make active execution ambiguous. Configure the process supervisor's termination grace period, keep handlers bounded and idempotent, and call producer `queue.close()` only after worker draining resolves.

Set a globally unique, stable, bounded `prefix` when applications or environments share one Redis database. Producers, workers, and operational tooling for one fleet must use the same value. This prevents accidental key collisions but is not a security boundary: mutually untrusted applications require separate Redis instances or distinct ACL users with restrictive key patterns. Logical Redis databases provide collision separation only unless access is independently constrained. Prefixes are visible in Redis keys, monitoring, and backups, so use only non-sensitive application/environment identifiers and never tenant PII, credentials, tokens, or customer-controlled values. Redis Cluster clients are supported and should use one validated hash tag such as `{orders-production}` so BullMQ's multi-key operations share a slot.

Changing a prefix creates a separate namespace and requires a coordinated migration. Validate producer/worker/tooling parity, start new-prefix workers before switching producers, keep old-prefix workers and tooling until waiting and delayed jobs drain and relevant deduplication TTLs expire, then retire the old keys. Deduplication remains local to the prefix and queue name. Tenant scope still belongs in logical deduplication IDs produced by trusted application code and is not inferred from propagated metadata.

`FailureReporter.listen()` observes terminal failures and `report()` notifies registered observers. A `BullMQConnection` owns the default shared reporter, so queues and workers that use the same connection instance also share `queue.onFailed()` observations; pass one explicit reporter to both constructors when custom composition requires separate connection wrappers. The worker CLI loads a default-exported `{ worker }` from `laravelize.queue.config.mjs` (or `--config=path`):

```js
// laravelize.queue.config.mjs
import { worker } from './server/queue.js'

export default { worker }
```

```bash
pnpm exec laravelize-queue-work --queue=reports --concurrency=4
```

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#bullmq-adapter). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-queue`](../queue/README.md), [`@luckys_luis/nuxt-laravelize-cache-redis`](../cache-redis/README.md), [`@luckys_luis/nuxt-laravelize-dead-letter`](../dead-letter/README.md).
