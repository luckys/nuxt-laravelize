# @nuxt-laravelize/queue

Portable jobs, versioned dispatch identity, bounded diagnostic tags, registry, execution scopes and an in-memory queue. Persistent Node workers live in `@nuxt-laravelize/queue-bullmq`.

`Queue.chain()` prepares 1-100 linear steps through final admission before admitting the first. Success admits the next step; retry, release or failure never advances early. The envelope is capped at 240 KiB, 8000 JSON nodes and 24 levels and intentionally has no branches, result passing, progress or cancellation. Handoffs remain at-least-once, so handlers require durable idempotency.

`Queue.batch()` eagerly final-admits 1-100 independent children to one queue. `batchStatus()` returns only bounded counters and `cancelBatch()` requests cooperative cancellation; `QueueBatchContext` lets active children poll or throw. Batch handles are locators, not authorization credentials: applications must enforce ownership before status or cancellation. The in-memory driver is volatile and `QueueFake` is testing-only. Durable progress requires the retained BullMQ/Redis flow state provided by `@nuxt-laravelize/queue-bullmq`; handlers still require durable idempotency or fencing.

Declare stable tags with `Job.tags()` and inspect a serialized snapshot with `readJobTags()`. Tags are visible diagnostic metadata, never authorization or telemetry dimensions; do not include secrets or personal data.

Shared queue serialization assigns each admitted dispatch a new opaque ID, snapshots JSON-safe payload data and stores a deterministic SHA-256 payload fingerprint. `readJobDispatchIdentity()` exposes a defensive copy and `fingerprintJobPayload()` uses the same canonical form. Retries and delayed releases retain one identity. This unkeyed metadata detects accidental corruption but is not producer authentication, confidentiality, replay prevention, deduplication or exactly-once execution.

`JobAdmissionMetadataContributorRegistry` exposes frozen final dispatch facts only through registry-backed queue admission. It is a synchronous extension point for application credential issuers, not a credential implementation or authentication guarantee.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#queue) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#queue) guide for jobs, drivers, retries and testing examples.
