# `@nuxt-laravelize/rate-limiter`

[Espanol](./README.es.md) | English

Cache-backed rate limiting for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/rate-limiter
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/rate-limiter'],
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

## Rate limiting

`@nuxt-laravelize/rate-limiter` provides cache-backed fixed-window limits. The complete preset registers it automatically; granular installations can add it directly.

```bash
pnpm add @nuxt-laravelize/rate-limiter
```

Consume an attempt with the auto-imported `useRateLimiter(event)`. The returned metadata is suitable for application responses and logs.

```ts
export default defineEventHandler(async (event) => {
  const result = await useRateLimiter(event).hit(`login:${userId}`, 5, 60)
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfter: result.retryAfter,
  }
})
```

Use `ThrottleRequests` in a Laravelized middleware pipeline to reject excess requests with `429 Too Many Requests`. It adds `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and, when rejected, `Retry-After`.

```ts
const throttle = new ThrottleRequests(useRateLimiter(event), {
  key: event => getRequestIP(event, { xForwardedFor: true }) ?? 'unknown',
  maxAttempts: 60,
  decaySeconds: 60,
})

return await throttle.handle(event, next)
```

| API | Purpose |
|---|---|
| `hit(key, maxAttempts, decaySeconds?)` | Atomically consumes one attempt and returns window metadata. |
| `attempts(key)` / `remaining(key, max)` | Inspects current usage without consuming an attempt. |
| `clear(key)` | Removes attempts and timer for one logical key. |
| `rateLimiterToken` | Resolves or replaces the configured limiter. |
| `useRateLimiter(event)` | Resolves the request-scoped singleton in Nitro. |

Distributed enforcement requires a shared cache adapter whose `add` and `increment` operations are atomic. The default `InMemoryCache` only coordinates requests handled by one long-lived process. Derive keys from trusted, bounded identifiers; hashing unbounded user input avoids attacker-controlled cache key growth.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#rate-limiting). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/cache`](../cache/README.md), [`@nuxt-laravelize/queue-middleware`](../queue-middleware/README.md).
