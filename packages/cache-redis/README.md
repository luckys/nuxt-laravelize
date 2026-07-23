# @nuxt-laravelize/cache-redis

Optional Node-only Redis/Valkey adapter for `@nuxt-laravelize/cache`, using ioredis 5.x.

```sh
pnpm add @nuxt-laravelize/cache @nuxt-laravelize/cache-redis ioredis
```

```ts
import Redis from 'ioredis'
import { RedisCache } from '@nuxt-laravelize/cache-redis'

const redis = new Redis(process.env.REDIS_URL!)
const cache = new RedisCache(redis, { prefix: 'my-app:cache:' })
// The application owns connection shutdown.
await redis.quit()
```

The prefix defaults to `laravelize:cache:` and must be non-empty and end in `:`. The delimiter prevents a flush for a namespace such as `tenant:1:` from overlapping `tenant:10:`. On a standalone Redis/Valkey connection, `flush()` uses escaped `SCAN` plus bounded `UNLINK` (or `DEL`) batches and never calls `KEYS` or `FLUSHDB`; it is non-atomic, so concurrent writes may survive or be removed. Single-key operations and scripts are compatible with ioredis Cluster, but `flush()` explicitly rejects Cluster clients because one-node `SCAN` cannot provide a complete prefix flush.

TTL numbers are seconds and absolute `Date` values use the client clock. TTLs are rounded up to whole milliseconds before being sent to Redis. Invalid dates, non-finite values, and positive results outside JavaScript's safe-integer/Redis-supported range are rejected. Nonpositive TTL behavior depends on the cache operation; notably, `add()` returns `false` without changing an existing value or its TTL.

`remember()` coalesces factories only within one `RedisCache` instance. After a factory completes it uses conditional `SET NX`, so a value written by another adapter or process while the factory was pending remains cached; the original caller still receives its own factory result. Mutations through the same adapter invalidate its pending population attempt. This is race protection, not a distributed lock: factories in different processes may run concurrently.

Values use a strict, versioned JSON-safe serializer. It accepts only null, booleans, finite numbers, strings, arrays, and plain objects; malformed or unsafe values fail closed. The default serializer is exported for diagnostics, but `RedisCache` intentionally does not accept a custom serializer because compare operations and atomic counters require its exact encoding.

Counters use Redis Lua's IEEE-754 double arithmetic and serialize results with enough significant digits to round-trip as a JavaScript `Number`. Fractional calculations therefore have normal binary floating-point semantics; arbitrary decimal exactness is not guaranteed.

Locks use renewable owner leases without fencing tokens. Redis/Valkey failover or replication lag can violate mutual exclusion; use a fenced coordination system when stale holders could cause unsafe writes.

## Release verification

Run the real Redis behavioral suite against a reachable disposable Redis/Valkey instance before release. The command fails when `REDIS_URL` is missing or connectivity cannot be established:

```sh
REDIS_URL='redis://localhost:6379' pnpm test:redis
```
