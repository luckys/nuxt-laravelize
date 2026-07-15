# @nuxt-laravelize/rate-limiter

Cache-backed fixed-window rate limiting for Nuxt Laravelize.

```ts
const result = await useRateLimiter(event).hit(`login:${userId}`, 5, 60)
if (!result.allowed) {
  // result.retryAfter contains the remaining window in seconds.
}
```

The configured cache adapter must provide atomic `add` and `increment` operations for correct coordination across processes.
