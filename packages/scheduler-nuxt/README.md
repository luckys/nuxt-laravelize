# @nuxt-laravelize/scheduler-nuxt

Nuxt/Nitro scheduler adapters and execution runtime.

Use `CacheLockSchedulerLockProvider` from `@nuxt-laravelize/scheduler-nuxt/cache-lock` with a `DistributedCache` such as `RedisCache` for `onOneServer()` tasks. Leases renew owner-atomically while work runs, release only for the current owner, and reject completion if renewal or ownership checks show that the lease was lost. Redis/Valkey leases do not provide fencing across failover.
