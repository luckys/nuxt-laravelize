# @nuxt-laravelize/idempotency

Atomic HTTP idempotency for H3 and the `@nuxt-laravelize/http` middleware pipeline.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/idempotency'],
  // Development/test only. The default `none` fails closed.
  laravelizeIdempotency: { driver: 'memory' },
})

const middleware = createIdempotencyMiddleware({
  principal: event => event.context.user.id,
})
```

For production, bind `idempotencyStoreToken` to a durable implementation of `IdempotencyStore`. Its acquire, renew, complete and fail operations must be atomic and mutations must compare the lease token. `InMemoryIdempotencyStore` is process-local and intentionally opt-in.

The fingerprint is SHA-256 over method, route with sorted query parameters, principal, normalized content type, and the exact raw body bytes. Exact bytes avoid lossy JSON number parsing while making body semantics deterministic. H3's `readRawBody` cache preserves request-body readability for later `readBody` validation. Completed JSON-safe return values and standard `Response` objects are replayed. Direct node response writes and streaming/unsupported values are rejected because they cannot be captured faithfully. Replay headers are allowlisted; cookies and hop-by-hop headers are never stored or replayed.

Failures are retained by default; explicitly use `failurePolicy: 'retry'` to permit another owner. Size, lease, heartbeat, retention, required/bypass methods, route, principal and replay headers are configurable. Durations and limits must be positive safe integers, and the heartbeat must be shorter than the lease.
