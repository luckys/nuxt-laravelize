# `@nuxt-laravelize/cache`

[Espanol](./README.es.md) | English

Portable cache contracts and in-memory driver for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/cache
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/cache'],
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

## Cache

`@nuxt-laravelize/cache` provides a portable async cache contract, Laravel-style convenience operations and a default in-memory driver.

```bash
pnpm add @nuxt-laravelize/cache
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/cache'],
})
```

The complete preset already registers this module.

Use the auto-imported `useCache(event)` in Nitro handlers. Numeric TTL values are seconds; a `Date` is an absolute expiration; omitting TTL stores forever.

```ts
export default defineEventHandler(async (event) => {
  const cache = useCache(event)
  const users = await cache.remember('users:active', 60, () => loadActiveUsers())
  return { users }
})
```

| API | Purpose |
|---|---|
| `get(key, default?)` / `has(key)` | Reads a value or checks a non-expired key. |
| `put(key, value, ttl?)` / `forever()` | Stores a value temporarily or permanently. Non-positive TTL removes it. |
| `add(key, value, ttl?)` | Atomically stores only when the key is absent. |
| `pull(key, default?)` | Reads and removes a value. |
| `forget(key)` / `flush()` | Removes one key or all keys. |
| `forgetIf(key, expected)` | Atomically removes a key only when its value still matches. |
| `remember(key, ttl, factory)` | Loads and caches a missing value; concurrent in-process calls share one factory promise. |
| `rememberForever(key, factory)` | Memoizes without expiration. |
| `increment()` / `decrement()` | Atomically changes a numeric value and creates a missing counter from zero. |
| `cacheToken` | Resolves the configured `Cache` implementation from the container. |
| `CacheFake` | In-memory test fake with `assertHas()`, `assertMissing()` and `reset()`. |

```ts
await cache.add('locks:report', ownerId, 30)
await cache.increment('login-attempts:user_1', 1, 60)
const token = await cache.pull<string>('password-reset:user_1')
```

`InMemoryCache` is appropriate for tests, development and one long-lived process. It lazily removes accessed expirations and opportunistically sweeps untouched expired values during writes. It does not coordinate across workers, instances, regions or serverless invocations. Bind a shared adapter to `cacheToken` for distributed caching or cross-process atomic operations. Cache is an optimization boundary: do not make domain correctness depend on cached data.

`undefined` is reserved for a cache miss and cannot be stored; use `null` when absence is itself the cached value. Mutations invalidate an in-flight `remember()` write so stale loaders cannot overwrite newer values.

### Atomic locks

Create an owner-safe lock with `useCacheLock(event, name, ttlSeconds)`. `run()` executes immediately when acquired and returns `undefined` when busy. `block()` polls until acquisition or throws `LockTimeoutError`.

```ts
export default defineEventHandler(async (event) => {
  return await useCacheLock(event, 'reports:daily', 30).block(5, async () => {
    return await generateDailyReport()
  })
})
```

Each lock exposes an opaque `owner` token. Pass that token as the fourth `useCacheLock()` argument to restore and release ownership from another process. Normal `release()` uses atomic compare-and-delete and cannot delete a lock reacquired by another owner after expiration. Reserve `forceRelease()` for administrative recovery because it intentionally ignores ownership.

Call `lock.renew(ttlSeconds?)` to atomically extend a lease only while its owner still matches. The `Cache.expireIf` capability is optional for backward compatibility with custom adapters; renewal fails closed with `false` when it is unavailable and is never emulated with a racy read and write. Cache locks have no fencing token, and Redis/Valkey failover or replication lag can violate mutual exclusion.

For shared Node deployments, install `@nuxt-laravelize/cache-redis` with ioredis 5. It supports Redis and Valkey, uses a mandatory scoped prefix, and leaves connection startup/shutdown to the application. It is intentionally not included in the `@nuxt-laravelize/nuxt` preset. Its prefix-only `flush()` uses escaped `SCAN` plus bounded `UNLINK`/`DEL`, is non-atomic, and must be run against every primary in Redis Cluster.

Distributed locks require shared cache adapters to implement both `add()` and `forgetIf()` atomically. Lock TTL must exceed the protected operation; expiration prevents permanent deadlocks but does not cancel a callback that runs too long.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#cache). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/cache-redis`](../cache-redis/README.md), [`@nuxt-laravelize/rate-limiter`](../rate-limiter/README.md), [`@nuxt-laravelize/queue-middleware`](../queue-middleware/README.md).
