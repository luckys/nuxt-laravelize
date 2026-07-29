# @nuxt-laravelize/queue-bullmq

Node-only BullMQ queue and worker. Importing `@nuxt-laravelize/queue` never loads BullMQ or ioredis.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#bullmq-adapter) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#adapter-bullmq) guide for connection, queue and worker examples.

`BullMQDeadLetterAdapter` uses public BullMQ APIs. Lists are metadata-only; payload and error summaries are separate opt-ins. Payloads are JSON-cloned and rejected above bounded size/depth/complexity. Retry fences hash job data and selected immutable options, but remain optimistic because BullMQ cannot atomically combine the final state check, retry, and an external receipt. A durable `DeadLetterOperationStore` is required; reserve occurs before retry, and pending replay is ambiguous and never blindly retried. The memory store is testing-only. This is not a claim of atomic or durable idempotency when the supplied store itself is not durable.

Destructive discard is intentionally unsupported: BullMQ's public APIs cannot atomically verify failed state and remove. `discard()` fails before mutation. Future scheduled retry is also rejected because public failed-job retry is immediate. Listing uses a complete bounded snapshot and keyset cursors for up to 1000 retained failed jobs. Larger sources are rejected as ambiguous and require a narrower queue or retention policy.

`BullMQWorker.stop()` performs one idempotent graceful drain: it rejects later queue registrations, closes every registered worker, waits for active jobs and terminal failure observers, and leaves waiting or delayed jobs in Redis. It deliberately has no force-close timeout; configure the process supervisor's grace period and close producer resources only after draining resolves.

`BullMQConnection` owns the default shared `FailureReporter`. Construct queues and workers with the same connection instance so `queue.onFailed()` receives worker terminal failures. Redis integration tests are mandatory in CI through `REDIS_URL=redis://127.0.0.1:6379 pnpm test:redis`.
