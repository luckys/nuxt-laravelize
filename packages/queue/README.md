# @nuxt-laravelize/queue

Portable jobs, bounded diagnostic tags, registry, execution scopes and an in-memory queue. Persistent Node workers live in `@nuxt-laravelize/queue-bullmq`.

Declare stable tags with `Job.tags()` and inspect a serialized snapshot with `readJobTags()`. Tags are visible diagnostic metadata, never authorization or telemetry dimensions; do not include secrets or personal data.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#queue) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#queue) guide for jobs, drivers, retries and testing examples.
