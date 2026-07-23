# @nuxt-laravelize/queue-bullmq

Node-only BullMQ queue and worker. Importing `@nuxt-laravelize/queue` never loads BullMQ or ioredis.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#bullmq-adapter) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#adapter-bullmq) guide for connection, queue and worker examples.

`BullMQDeadLetterAdapter` uses public BullMQ APIs. Lists are metadata-only; payload and error summaries are separate opt-ins. Payloads are JSON-cloned and rejected above bounded size/depth/complexity. Retry fences hash job data and selected immutable options, but remain optimistic because BullMQ cannot atomically combine the final state check, retry, and an external receipt. A durable `DeadLetterOperationStore` is required; reserve occurs before retry, and pending replay is ambiguous and never blindly retried. The memory store is testing-only. This is not a claim of atomic or durable idempotency when the supplied store itself is not durable.

Destructive discard is intentionally unsupported: BullMQ's public APIs cannot atomically verify failed state and remove. `discard()` fails before mutation. Future scheduled retry is also rejected because public failed-job retry is immediate. Listing uses a complete bounded snapshot and keyset cursors for up to 1000 retained failed jobs. Larger sources are rejected as ambiguous and require a narrower queue or retention policy.
