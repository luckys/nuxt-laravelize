# @nuxt-laravelize/cache

Portable cache contracts, Laravel-style convenience operations, owner-safe atomic locks and a single-process in-memory driver.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#cache) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#cache) guide for TTL, counters, locks, memoization and testing examples.

For shared Node deployments, install the optional `@nuxt-laravelize/cache-redis` Redis/Valkey adapter. Lock leases support owner-safe `renew()`, but have no fencing token and cannot guarantee mutual exclusion through datastore failover.

`Cache.expireIf` is an optional capability so existing custom cache adapters remain compatible. `CacheLock.renew()` returns `false` when an adapter omits it; renewal is never emulated with a non-atomic read and write.

Adapters safe for cross-process owner leases implement the explicit `DistributedCache` capability. `InMemoryCache` intentionally does not, so it cannot be passed to integrations that require distributed, owner-atomic acquire, release, and renewal.
