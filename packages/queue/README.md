# @nuxt-laravelize/queue

Portable jobs, versioned dispatch identity, bounded diagnostic tags, registry, execution scopes and an in-memory queue. Persistent Node workers live in `@nuxt-laravelize/queue-bullmq`.

Declare stable tags with `Job.tags()` and inspect a serialized snapshot with `readJobTags()`. Tags are visible diagnostic metadata, never authorization or telemetry dimensions; do not include secrets or personal data.

Shared queue serialization assigns each admitted dispatch a new opaque ID, snapshots JSON-safe payload data and stores a deterministic SHA-256 payload fingerprint. `readJobDispatchIdentity()` exposes a defensive copy and `fingerprintJobPayload()` uses the same canonical form. Retries and delayed releases retain one identity. This unkeyed metadata detects accidental corruption but is not producer authentication, confidentiality, replay prevention, deduplication or exactly-once execution.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#queue) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#queue) guide for jobs, drivers, retries and testing examples.
