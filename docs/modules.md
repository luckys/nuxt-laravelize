# Module and API guide

[Espanol](./modules.es.md) | English

This guide covers every public Nuxt Laravelize package. Imports from paths not listed here are internal and may change without notice.

## Nuxt preset

Install `@nuxt-laravelize/nuxt` when you want the stable modules, the reliability queue bridge, and `nuxt-i18n-micro` configured together. BullMQ, durable reliability adapters, and the experimental scheduler are intentionally excluded.

```bash
pnpm add @nuxt-laravelize/nuxt
```

```ts
// nuxt.config.ts
import Laravelize from '@nuxt-laravelize/nuxt'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'en', iso: 'en-US', dir: 'ltr' }],
    defaultLocale: 'en',
    translationDir: 'locales',
  },
})
```

Use `$t()` in templates or `useI18n().$t()` in scripts. Set `i18n: false` to disable the integration.

Nitro handlers use the same generated `nuxt-i18n-micro` dictionaries, fallback configuration, and plural function through the server-only API:

```ts
export default defineEventHandler(async (event) => {
  const i18n = await useServerLocalization(event)
  return { message: i18n.t('welcome', { name: 'Ada' }), count: i18n.tc('apples', 2) }
})

import { createServerLocalization } from '@nuxt-laravelize/nuxt/runtime/server'
const i18n = await createServerLocalization(context.snapshot().locale ?? 'en')
```

`createServerLocalization()` supports jobs, mail preparation, notifications, CLI, and scheduler code without an H3 event. `ServerLocalization` exposes canonical `locale`, exact configured `localeCode`, `defaultLocale`, `fallbackLocale`, `fallbackLocales`, `availableLocales`, `t`, `tc`, `tn`, `td`, and `tdr`. Request resolution follows configured path/query, locale cookie, `Accept-Language`, and default behavior; configured code, ISO, and language aliases participate in automatic detection. Public locale values and Intl formatting use canonical BCP 47 tags, while dictionaries and custom plural rules use the exact configured code (for example, `en_US` exposes `en-US` but plural receives `en_US`). Explicit and detected locales match only configured aliases and malformed or unsupported values never become asset paths. A selected locale's configured fallback chain runs before global/default fallback, with duplicate and cyclic references bounded; every reference must resolve to an enabled locale. Both `source` and premerged translation payload modes are supported. Missing global/index payloads safely behave as empty dictionaries, so page-only locale layouts remain route-specific. Each localization object is request-local. The public server entry can be imported in plain Node, and `createServerLocalization(locale, source)` accepts an injectable eventless source. Localization APIs and Nitro integration are not registered when i18n is false, missing, or has no usable locales.

## Authorization

`@nuxt-laravelize/authorization` is included in the preset. Its core is H3-independent: resolve `authorizationToken` in HTTP, queues, workflows or CLI scopes, and use the auto-imported `useAuthorization(event)` only at the HTTP boundary. Register global abilities and resource policies once through the singleton `authorizationRegistryToken`; resource types are explicit stable keys and duplicate registrations fail immediately.

The scoped authorizer calls the overrideable `principalResolverToken` to reload the current principal. Propagated or serialized execution-context snapshots are metadata, never credentials. For queue contexts, an ordinary principal result is centrally denied; return `trustQueuePrincipal(principal)` only after the application independently authenticates delegation or the current worker identity. That assertion is application responsibility and must not derive from envelope actor, tenant, attributes, or other claims. The default resolver returns no principal and therefore denies. `inspect` returns a bounded typed decision, while `allows`, `denies`, `authorize`, `any`, and `none` provide convenience behavior. The resource ability name `before` is reserved for the policy hook; the requested action must exist before the hook runs, and `null`/`undefined` means continue. Portable denial and undefined-ability errors contain no H3 dependency; map denials to 403 in HTTP code.

## Typed routes

`@nuxt-laravelize/routes` generates `#laravelize/routes` from explicit declarations and is included in the preset. It infers URL parameters and HTTP methods only; request bodies and responses are intentionally **not inferred**.

```ts
// routes.ts
import { route } from '@nuxt-laravelize/routes/runtime'

export default {
  users: {
    show: route('GET', '/users/{user}/{section?}'),
    files: route('GET', '/users/{user}/files/{path+}'),
    browse: route('GET', '/files/{path*}'),
  },
} as const
```

The conventional `routes.ts` is loaded automatically. Configure `laravelizeRoutes.declarations` for other explicit files and `baseURL` for a shared prefix. Use `{id}` for required values, `{id?}` for optional values, `{path+}` for a required non-empty catch-all, and `{path*}` for an optional catch-all.

```ts
import routes from '#laravelize/routes'

routes.users.show({ user: 42 }, { query: { preview: true } })
// { method: 'GET', url: '/users/42?preview=1' }
```

Path values are encoded. Catch-all arrays retain segment boundaries, while `.` and `..` segments are rejected to prevent traversal-style URLs. Query keys are sorted, array order is retained, booleans use `1`/`0`, and nullish values are omitted. Package authors can register declarations with `addRoutesDeclaration()` from `@nuxt-laravelize/routes/kit`.

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

## Encryption

`@nuxt-laravelize/encryption` provides authenticated AES-256-GCM encryption through the Web Crypto API.

```bash
pnpm add @nuxt-laravelize/encryption
```

Generate a base64url key once and store it in a private environment variable. Never commit production keys.

```ts
import { generateEncryptionKey } from '@nuxt-laravelize/encryption/runtime'

console.log(generateEncryptionKey())
```

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    laravelizeEncryption: {
      key: process.env.NUXT_LARAVELIZE_ENCRYPTION_KEY,
      previousKeys: process.env.NUXT_LARAVELIZE_ENCRYPTION_PREVIOUS_KEYS?.split(',') ?? [],
    },
  },
})
```

Use the auto-imported `useEncrypter(event)` for strings or bytes. A purpose is authenticated but not stored separately; the same purpose is required for decryption.

```ts
const crypt = useEncrypter(event)
const payload = await crypt.encryptString(userId, { purpose: 'password-reset' })
const restored = await crypt.decryptString(payload, { purpose: 'password-reset' })
```

The primary key encrypts new payloads. `previousKeys` are tried only for decryption, enabling rolling rotation without accepting old keys for new ciphertext. Invalid keys fail at service resolution, while malformed, tampered, wrong-purpose and wrong-key payloads all produce the same `DecryptionError` without exposing authentication details.

Encrypted payloads provide confidentiality and integrity, not expiration or replay prevention. Store expiry and one-time-use state separately when building reset links or session tokens.

## Hashing

`@nuxt-laravelize/hashing` provides password hashing through PBKDF2-SHA-256 and Web Crypto.

```bash
pnpm add @nuxt-laravelize/hashing
```

```ts
const hasher = useHasher(event)
const hash = await hasher.make(password)

if (await hasher.check(password, hash) && hasher.needsRehash(hash)) {
  await users.updatePasswordHash(userId, await hasher.make(password))
}
```

Hashes include a random 128-bit salt, algorithm identifier and iteration count. Different calls for the same password produce different hashes. `check()` accepts older valid costs while `needsRehash()` compares them with the current configuration.

The default is 600,000 iterations. Benchmark production hardware before increasing it, and configure `runtimeConfig.laravelizeHashing.iterations` consistently across instances. Embedded costs above 10,000,000 are rejected before deriving a key to bound denial-of-service risk from untrusted or corrupted hash strings.

Hashing is one-way and intended for passwords. Use `@nuxt-laravelize/encryption` when the original value must be recovered. Rate-limit authentication endpoints independently; password hashing does not prevent online guessing.

## Filesystem

`@nuxt-laravelize/filesystem` provides Laravel-style named disks behind a portable byte-oriented contract.

```bash
pnpm add @nuxt-laravelize/filesystem
```

The complete preset registers an in-memory default disk. Use `useFilesystem(event, disk?)` in Nitro handlers.

```ts
export default defineEventHandler(async (event) => {
  const files = useFilesystem(event)
  await files.write('exports/report.csv', csv)
  return { bytes: await files.size('exports/report.csv') }
})
```

| API | Purpose |
|---|---|
| `write()` / `read()` / `readText()` | Stores strings or bytes and reads defensive byte copies or UTF-8 text. |
| `exists()` / `delete()` / `size()` | Inspects and removes files. |
| `copy()` / `move()` | Copies or moves a file within one disk. |
| `list(prefix?)` | Recursively lists normalized logical paths in stable order. |
| `FilesystemManager` | Registers and resolves named disks. |
| `FilesystemFake` | In-memory fake with assertions and reset support. |

The portable `InMemoryFilesystem` is intended for tests, development, or ephemeral files in one process. For persistent Node deployments, register `LocalFilesystem` from `@nuxt-laravelize/filesystem/node` in a custom provider:

```ts
import { LocalFilesystem } from '@nuxt-laravelize/filesystem/node'

manager.register('reports', new LocalFilesystem('/srv/app/storage/reports'))
```

`LocalFilesystem` normalizes separators, rejects null bytes, `..` traversal and symbolic links, and confines every operation to its configured root. Do not use it as shared storage across serverless instances; register an object-storage adapter instead.

Cloud storage adapters are optional packages and are not installed by the complete preset:

```ts
import { CloudflareR2Filesystem } from '@nuxt-laravelize/filesystem-cloudflare'

manager.register('uploads', new CloudflareR2Filesystem(env.UPLOADS, {
  prefix: 'production/uploads',
  maxListObjects: 20_000,
}))
```

The Cloudflare adapter is structural and binding-native: it does not import Workers types or the AWS SDK. The binding must provide `get`, `head`, `put`, `delete`, and paginated `list`. For AWS S3, or Cloudflare R2 through its S3-compatible API outside Workers, use the isolated AWS package:

```ts
import { createAwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'

manager.register('archive', createAwsS3Filesystem({
  bucket: 'app-archive',
  prefix: 'production',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
}))
```

For R2 use endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`, and `forcePathStyle: true`. Both adapters require already-normalized relative paths and prefixes: absolute paths, backslashes, repeated separators, dot segments, traversal, and null bytes are rejected. Listing follows provider pagination, verifies prefix boundaries, and fails instead of returning partial data if the configurable object cap is exceeded or a continuation token does not progress. Keep credentials in private server configuration; factories never read environment variables or emit credentials.

Cloud object moves are copy-then-delete, not atomic. The source is deleted only after a successful destination write/copy. A later delete failure can leave both objects; retry or reconcile that state in application workflows that require exactly one copy. Same-path moves verify existence and perform no mutation.

### Advanced filesystem capabilities

Advanced behavior is optional and discovered with guards such as `isTemporaryUrlFilesystem()`, `isDirectUploadFilesystem()`, `isUploadConfirmationFilesystem()`, `isStreamFilesystem()`, and `isMultipartFilesystem()`. A false guard means unsupported; callers must not synthesize URLs or emulate security semantics.

Create direct-upload authority with `createDirectUploadPolicy()`. Policies are frozen JSON values and require one normalized path inside `keyPrefix`, a positive `maxBytes`, MIME allowlist, actor, tenant, and an expiry no more than seven days away. Checksum remains optional in the portable contract for adapters with another immutable promotion mechanism, but S3 issuance requires exact SHA-256. S3 returns a presigned POST whose policy enforces `content-length-range` from zero through `maxBytes` plus exact key, selected MIME, actor/tenant metadata, and checksum conditions. Submit the returned form fields unchanged. After upload, call `confirmUpload(grant)` with the trusted server-held grant and continue only when provider size, selected MIME, metadata, and checksum match.

```ts
import { createDirectUploadPolicy, isDirectUploadFilesystem, isUploadConfirmationFilesystem } from '@nuxt-laravelize/filesystem/runtime'

const policy = createDirectUploadPolicy({
  path: `quarantine/${crypto.randomUUID()}`,
  keyPrefix: 'quarantine',
  maxBytes: bytes,
  mimeTypes: ['application/pdf'],
  checksum: { algorithm: 'sha256', value: sha256Hex },
  actorId: user.id,
  tenantId: tenant.id,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
})

if (!isDirectUploadFilesystem(files) || !isUploadConfirmationFilesystem(files)) throw new Error('Direct upload is unsupported')
const grant = await files.createDirectUpload({ policy, mimeType: 'application/pdf' })
// Return the bearer grant only from an authenticated, authorized, rate-limited server endpoint.
// Keep this trusted grant server-side; do not accept a serialized grant from the browser for confirmation.
const confirmed = await files.confirmUpload(grant)
```

Actor and tenant form metadata are exact signed-policy correlation values, not authentication. Scoped wrappers bind issuance to the canonical scope audience and validate the exact returned prefix boundary. S3 confirmation atomically reserves the canonical record by random grant ID: concurrent attempts fail, provider and metadata/checksum failures release it for retry until expiry, and success atomically removes it, immediately releasing bounded capacity while `confirmUpload()` replay remains rejected. The provider-issued presigned POST is separate authority and remains reusable until its signed expiry; confirmation does not and cannot fake revocation. Use a short TTL, a unique private quarantine key per issuance, idempotent/event-deduplicated processing, and provider lifecycle cleanup. The default store is process-local; a durable shared `S3UploadIssuanceStore` must implement atomic conditional `reserve`, `release`, and `complete` for restart-safe or multi-instance confirmation. The mandatory S3 checksum means a replayable POST can only replace the object with identical bytes and exact metadata. Confirmation is not content inspection, virus scanning, or authorization. Authenticate and authorize issuance independently, scan/transform in an application queue or workflow, and release only the accepted object. Never log signed URLs or form fields. The R2 binding cannot sign and intentionally fails URL capability guards; use the S3-compatible adapter with server-only credentials.

For multi-instance confirmation, inject `RedisS3UploadIssuanceStore` from `@nuxt-laravelize/filesystem-aws-redis`. Its single-key Lua transitions use Redis time, preserve the policy TTL, check audience before exposing reservation state, fence release/completion by random token, and reject corrupt records. Choose an application-specific prefix and keep Redis persistent; asynchronous Redis failover can still lose acknowledged state, so uploads remain quarantined and downstream processing must be idempotent.

`scopedFilesystem(files, prefix)` applies confinement to both operands and every exposed optional capability. `readOnlyFilesystem(files)` rejects base mutations and omits optional mutation methods. `quarantineFilesystem()` provides explicit `disk`, `release()`, and `reject()` operations and performs no implicit scan. Secure `release({ accepted: true, path, checksum: { algorithm: 'sha256', value } }, destination, destinationPath?)` accepts only trusted scanner/workflow evidence for the normalized path and exact digest; it reads one coherent byte snapshot, verifies and writes those exact bytes, and retains the quarantine source in every successful case. A concurrent replacement is neither promoted nor deleted. Never accept release evidence from a client. Cleanup is an explicit later `reject()` or provider-lifecycle action only after the caller establishes an immutable path/version; `release()` performs no read-then-delete because the portable contract has no conditional-delete/version primitive. Mutable `ReadFallbackFilesystem(primary, fallback, tombstones)` requires an explicit async `FilesystemTombstoneStore`; production stores must be durable, shared, and namespaced to that logical disk pair. Tombstones are monotonic authoritative deletion history and are never automatically cleared. Delete records before primary removal. A non-same-path compatibility move creates the primary destination, records the source tombstone, then removes the primary source; it is not atomic, so a crash or delete failure can leave both primary objects, while destination failure leaves the source visible and untombstoned. Concurrent source writers require external serialization or provider fencing because the portable contract has no conditional move. A present primary path is visible even when tombstoned; if that primary later disappears, stale fallback remains suppressed. Fallback `read`, `readText`, `size`, and `exists` recheck the tombstone after fallback work and perform one bounded primary recheck to prefer a concurrent replacement; `list()` deliberately retains snapshot semantics. Compaction is deliberately not a runtime API: administrators may compact only after verifying fallback deletion/retention, with explicit growth, retention, backup, and monitoring policy. `InMemoryFilesystemTombstoneStore` is process-local testing/development support, not a production default. Authorization, integrity, and other errors never trigger fallback.

Streams pass native provider bodies when available. The R2 adapter converts async iterables to pull-based web streams without collecting the complete body. Multipart is an explicit `startMultipart` / `uploadPart` / `completeMultipart` / `abortMultipart` lifecycle and is currently implemented by S3. Keep upload IDs server-side and actor/tenant scoped, bound manifests and total bytes, always expose abort/recovery, and configure provider cleanup for abandoned parts.

## Core

`@nuxt-laravelize/core` provides the dependency container, typed tokens, service providers, application lifecycle and logging. Feature modules install it automatically.

```bash
pnpm add @nuxt-laravelize/core
```

### Container and tokens

| API | Purpose |
|---|---|
| `createToken<T>(key)` | Creates a typed service identifier. |
| `createContainer()` | Creates an empty container. |
| `bind(token, factory)` | Registers a transient service. |
| `singleton(token, factory)` | Registers one shared instance. |
| `scoped(token, factory)` | Registers one instance per child scope. |
| `instance(token, value)` | Registers an existing value. |
| `make(token)` / `has(token)` | Resolves a service or checks its registration. |
| `createScope()` | Creates a request or operation scope. |
| `seal()` | Prevents further registrations. Nuxt seals after boot. |
| `dispose()` | Disposes this container. Dispose each child scope separately. |

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

interface Clock { now(): Date }
const clockToken = createToken<Clock>('app.clock')
const container = createContainer()

container.singleton(clockToken, () => ({ now: () => new Date() }))
container.seal()

const now = container.make(clockToken).now()
```

Implement `ServiceProvider.register()` for bindings and optional `boot()` for work that requires all providers to be registered.

```ts
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

export default class ClockServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(clockToken, () => ({ now: () => new Date() }))
  }
}
```

Register an application provider from a Nuxt module with `addLaravelizeProvider(nuxt, path, mode)` from `@nuxt-laravelize/core/kit`. In Nitro handlers, the auto-imports `useContainer(event)` and `useLogger(event)` resolve the current request scope.

### Logging

| API | Purpose |
|---|---|
| `ConsoleLogger` | Writes human-readable records to a console. |
| `StructuredLogger` | Writes structured JSON records. |
| `FileLogger` | Appends records to a file; use in Node runtimes. |
| `loggerFor(resolver)` | Resolves `loggerToken` or returns a warning-level console fallback. |
| `shouldEmit(level, minimum)` | Compares log levels using `LOG_LEVELS`. |
| `FakeLogger` | Records logs for assertions through `/testing`. |

```ts
import { ConsoleLogger } from '@nuxt-laravelize/core/runtime'

const logger = new ConsoleLogger({ threshold: 'info' })
logger.info('Invoice created', { invoiceId: 'inv_1' })
```

The lifecycle classes `LaravelizeApplication` and `Kernel`, container errors, logger contracts and option interfaces are exported for framework and adapter authors. Most applications use providers and the Nuxt runtime helpers instead.

## Events

`@nuxt-laravelize/events` dispatches events synchronously. Listener definitions registered during boot are shared with request and worker dispatchers, while listener instances and their dependencies are resolved from the current scope.

```bash
pnpm add @nuxt-laravelize/events
```

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'
import { InMemoryDispatcher, type Listener } from '@nuxt-laravelize/events/runtime'

class UserRegistered {
  constructor(readonly userId: string) {}
  toPayload() { return [this.userId] }
}

const listenerToken = createToken<Listener<UserRegistered>>('listeners.welcome-user')
const container = createContainer()
container.singleton(listenerToken, () => ({
  handle: async event => console.log(`Welcome ${event.userId}`),
}))

const events = new InMemoryDispatcher(container)
events.listen(UserRegistered, listenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Purpose |
|---|---|
| `listen(Event, listenerToken)` | Registers a listener for one event class. |
| `listenAny(listenerToken)` | Registers a listener for every event. |
| `subscribe(subscriberToken)` | Lets an `EventSubscriber` register multiple listeners. |
| `dispatch(event)` | Runs listeners in order; returning `false` stops propagation. |
| `ShouldQueue` | Marks a listener with `shouldQueue: true` for the optional queue adapter. |
| `dispatcherToken` | Resolves the configured `Dispatcher`; `useDispatcher(event)` is auto-imported in Nitro. |
| `eventListenerRegistryToken` | Registers boot-time listener definitions shared by request and worker dispatchers. |
| `EventFake` | Records events and provides `assertDispatched`, `assertNotDispatched` and `reset`. |

Application providers that register listeners during boot should resolve `eventListenerRegistryToken`; an `EventSubscriber` can receive that registry directly from the provider. `dispatcher.listen()`, `listenAny()`, and `subscribe()` remain local to the current request or worker dispatcher and never leak registrations into sibling scopes.

```ts
import { EventFake } from '@nuxt-laravelize/events/testing'

const events = new EventFake()
await events.dispatch(new UserRegistered('user_1'))
events.assertDispatched(UserRegistered, event => event.userId === 'user_1')
```

## Broadcasting

`@nuxt-laravelize/broadcasting` is included in the preset and bridges dispatched `ShouldBroadcast` events to public, private, or presence channels. Every event must implement `broadcastWith()` explicitly; event properties are never reflected, preventing accidental payload leakage. Register private and presence authorization rules with the request-scoped `useBroadcastChannels(event)` registry. The preset fails closed by default; the bounded memory driver must be enabled explicitly for development or tests.

```ts
import { PrivateChannel } from '@nuxt-laravelize/broadcasting/runtime'

class OrderUpdated {
  constructor(readonly orderId: string, readonly internalNote: string) {}
  broadcastOn() { return new PrivateChannel(`orders.${this.orderId}`) }
  broadcastAs() { return 'order.updated' }
  broadcastWith() { return { orderId: this.orderId } }
}

useBroadcastChannels(event).channel('orders.{orderId}', (user, { orderId }) => userCanView(user, orderId))
```

`@nuxt-laravelize/broadcasting-pusher` is an opt-in **server adapter**. Inject `PusherBroadcaster` through `broadcasterToken` and keep credentials in private runtime config. It does not provide or install a browser WebSocket client or Laravel Echo; choose and configure client subscriptions separately.

## AI SDK

`@nuxt-laravelize/ai-sdk` is an opt-in server module built on AI SDK 7. It provides named model connections, `useAi(event)`, typed reusable agents, text streaming, tools, structured output, explicit capability checks, and `AiFake`. It is not included in the preset and requires Node.js 22 or newer.

```bash
pnpm add @nuxt-laravelize/ai-sdk ai zod @ai-sdk/anthropic
```

Register providers explicitly in `server/providers`; the module never imports provider packages or reads provider credentials itself:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { AiConnectionRegistry, aiConnectionsToken } from '@nuxt-laravelize/ai-sdk/runtime'

export default class AiConnectionsServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(aiConnectionsToken, () => {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      return new AiConnectionRegistry().register('anthropic', {
        defaultModel: 'claude-sonnet-4-6',
        model: model => anthropic(model),
      })
    })
  }
}
```

Generate with `await useAi(event).generate({ prompt })`, or return `useAi(event).stream({ prompt }).toTextStreamResponse()` from a Nitro handler. `defineAgent<Input, Result>()` packages instructions, tools, output schema, model selection, and prompt construction without owning persistence or execution. Cloudflare Workers AI works through its AI SDK-compatible provider. Flue and Cloudflare Agents are agent runtimes rather than model providers and remain outside this model API.

Provider-specific options pass through unchanged. Capabilities default to enabled and can be disabled per connection. The package does not automatically log, audit, cache, or persist prompts and responses because they may contain credentials, personal data, or regulated information.

## Agent SDK

`@nuxt-laravelize/agent-sdk` is a separate opt-in common API for stateful agent runtimes. It registers named runtimes in the existing container and exposes `useAgentRuntime(event)`, typed `defineAgent()` definitions, synchronous `invoke`, asynchronous `dispatch` receipts, and async-iterable `observe` streams. Results, receipts, events, offsets, and runtime clients retain `native` escape hatches. Capabilities distinguish event streams, conversation projections, and JSON state instead of treating them as one state model.

`@nuxt-laravelize/agents-cloudflare` maps operations to Cloudflare Agents 0.17.x callable RPC while preserving class and Durable Object instance identity. `@nuxt-laravelize/agents-flue` maps agent operations to persistent conversations and workflow operations to durable runs using pinned `1.0.0-beta.9` packages; offsets remain opaque. All three packages are absent from the preset. Keep credentials in private runtime configuration and authorize agent identities before calls.

## Audit

`@nuxt-laravelize/audit` is included in the preset and exposes `useAudit(event)`. Recording is explicit:

```ts
await useAudit(event).record({
  action: 'patient.viewed',
  outcome: 'success',
  target: { type: 'patient', id: patientId },
  metadata: { reason: 'care-plan' },
})
```

The recorder generates the ID/time and enriches actor, tenant, execution, correlation, causation, source, and trace fields from trusted scoped execution context. Callers cannot override them. Actions/references use bounded safe identifiers. Changes and metadata must be bounded plain JSON; functions, symbols, cycles, custom prototypes, and excessive depth, keys, arrays, or bytes are rejected. Common credential keys and configured redaction keys become `[REDACTED]`.

The preset defaults to bounded, non-evicting memory in development and disabled persistence in production; both warn, and disabled recording fails closed. Configure `laravelizeAudit.driver: 'memory'` explicitly only when volatility is acceptable, or override `auditStoreToken` with durable storage. Set `requireTenantId: true` for tenant-scoped systems. Optional `@nuxt-laravelize/audit-drizzle` provides append-only-by-interface PostgreSQL, SQLite, and Turso/libSQL stores; apply `0002_add_audit_locale.sql` or `0003_add_audit_locale_sqlite.sql` when upgrading so the trusted execution-context locale remains a first-class column. Database immutability still requires least-privilege credentials and retention controls. `occurredAt` is application time, not authoritative ingestion order. `AuditFake` provides defensive assertions.

Audit is neither logging nor domain-event serialization. Do not pass request/response bodies or arbitrary models. Automatic policy/HTTP auditing is deferred to a future neutral `audit-http` bridge.

## Reliability and webhooks

`@nuxt-laravelize/reliability` provides versioned JSON-safe envelopes, leased outbox processing, and inbox deduplication. The preset includes `@nuxt-laravelize/reliability-queue` so reliable handlers and `ReliableMessageJob` are registered, but deliberately binds no volatile production store. Every production application must bind durable, shared Inbox and Outbox stores; `reliability-drizzle` is optional. Webhooks remain a framework-neutral opt-in. Delivery is **at least once**: retries, lease expiry, worker crashes, and acknowledgement ambiguity (the effect committed but its acknowledgement was lost) can all repeat a message, so every handler and webhook receiver must be idempotent.

Dead-letter management is opt-in through `@nuxt-laravelize/dead-letter`; the preset installs no administrative adapter. Applications must authorize list/view/payload/error-summary/retry/discard and the stronger inbox-retry ability. Payload, error summaries, and tenant hints are opt-in and envelope identity is never authorization. Adapter capabilities fail closed when omitted. Reliability supports retry scheduling and discard; BullMQ supports immediate retry only. Inbox retry can repeat side effects. Reliability receipts are bounded operation idempotency/audit metadata, not full attempt history. Active dead evidence is retained by default. BullMQ fencing is optimistic; its adapter lists bounded snapshots of at most 1000 retained failed jobs and rejects larger sources, which require a narrower queue or retention policy. No bulk actions are provided.

Install `@nuxt-laravelize/dead-letter-operations` separately for the optional operations dashboard. It is disabled by default and absent from the preset. Enabling it requires at least one exact canonical `allowedOrigins` value; configure literal nonoverlapping `pagePath` and `apiPath`, register adapters from an application provider, and define the dead-letter abilities centrally. The fixed API independently authorizes every endpoint, exposes payload only through its dedicated endpoint, never exposes tenant hints, requires revision-fenced CSRF-guarded JSON mutations, and returns 503 when no adapter exists. See the package README for configuration.

```bash
pnpm add @nuxt-laravelize/reliability @nuxt-laravelize/webhooks
# Optional durable Drizzle adapter:
pnpm add @nuxt-laravelize/reliability-drizzle drizzle-orm
```

The envelope execution-context snapshot is correlation provenance only. It **MUST NOT** authorize a tenant, actor, role, or resource. Re-authenticate and re-authorize against trusted current application state inside the consumer.

```ts
import { createEnvelope } from '@nuxt-laravelize/reliability'
import { DrizzlePostgresReliabilityStore } from '@nuxt-laravelize/reliability-drizzle/postgres'

const store = new DrizzlePostgresReliabilityStore(db)
const envelope = createEnvelope({
  type: 'invoice.paid.v1',
  payload: { invoiceId: 'inv_1' },
})

await db.transaction(async (tx) => {
  await markInvoicePaid(tx, 'inv_1')
  await store.appendWith(tx, envelope, {
    availableAt: new Date(Date.now() + 60_000).toISOString(),
  })
})
```

`availableAt` is the earliest claim time and defaults to the envelope's `occurredAt`; scheduling never changes when the event occurred. Both values require canonical ISO timestamps. Repeating an append with the same ID, normalized envelope, and availability is idempotent. Reusing an ID with different content or availability throws `OutboxMessageConflictError` instead of silently discarding a message.

The business write and `appendWith(tx, envelope, options)` **must use the same database transaction and connection**. Appending before or after that transaction reintroduces the dual-write gap and can lose an event or publish one for rolled-back state. Apply the supplied base migration followed by the dialect-specific append-availability migration. The immutable schedule remains stable while mutable delivery availability advances during retries. The in-memory `/testing` store is bounded, volatile, and only for tests/development; production requires a durable shared store, stable worker owner IDs, bounded leases/retries, heartbeat/lease renewal for work that may outlive its lease, dead-message monitoring, and retention/reconciliation operations. Drizzle remains optional and is installed only when this adapter is selected.

Apply the dialect terminal-time migration (`0004` PostgreSQL or `0005` SQLite/Turso), then run bounded retention passes with `store.prune({ namespace: 'outbox', completedBefore, states: ['delivered'], types: ['laravelize.workflow.wake.v1'], limit: 500 })`. Retention uses authoritative `terminal_at`, never envelope or eligibility time; legacy terminal rows remain null until an operator explicitly backfills them. Dead rows require explicit selection and should normally be retained for incident evidence. Pruning shortens durable ID deduplication, so keep rows beyond clock skew and the maximum replay window.

Run outbox delivery as a supervised process. Its config module exports an `OutboxWorker`; SIGINT/SIGTERM stop intake, drain in-flight work, then close resources. Use `--once` for one operational pass (including scheduler invocation), never `run()` from a scheduler because overlapping long-lived workers break ownership assumptions.

```bash
pnpm exec outbox-work --config ./outbox-worker.config.js
pnpm exec outbox-work --once --config ./outbox-worker.config.js
pnpm exec webhook-work --config ./webhook-worker.config.js
```

`@nuxt-laravelize/webhooks` supplies `OutgoingWebhookProcessor`, raw-body HMAC verification, and `WebhookInboxReceiver`. Its transport is **Node-only** because it uses Node DNS, crypto, buffers, and server-side fetch. Resolve signing secrets at delivery time; only `secretId` belongs in an outbox payload. Production constructors require durable outbox/inbox stores.

```ts
import { OutgoingWebhookProcessor, createWebhookEnvelope } from '@nuxt-laravelize/webhooks'

await store.append(createWebhookEnvelope({
  url: 'https://hooks.example.com/orders',
  secretId: 'customer-42-current',
  body: { orderId: 'order_1' },
}))

const webhooks = new OutgoingWebhookProcessor(store, {
  owner: 'webhooks-worker-1',
  resolveSecret: secrets.resolve,
  production: true,
})
await webhooks.runOnce()
```

Outgoing URLs require HTTPS port 443, reject credentials and private/reserved addresses, disable redirects, and use bounded timeouts. Custom transports must preserve those redirect, timeout, DNS/IP, and TLS restrictions. SSRF risk is reduced, not eliminated: DNS validation and the later connection are not atomically pinned, leaving a DNS-rebinding/TOCTOU residual. For untrusted destinations, enforce an allowlisted egress proxy or connection-level address pinning plus network egress policy. Verify incoming signatures against the exact raw bytes, enforce timestamp tolerance, authenticate/authorize endpoint ownership separately, and retain inbox deduplication records for at least the sender's retry window.

## Queue

`@nuxt-laravelize/queue` defines portable jobs and includes an in-memory queue. The Nitro auto-import `useQueue(event)` resolves the active driver.

```bash
pnpm add @nuxt-laravelize/queue
```

```ts
import { createToken, type Resolver } from '@nuxt-laravelize/core/runtime'
import { Job } from '@nuxt-laravelize/queue/runtime'

interface SendReportPayload extends Record<string, unknown> { reportId: string }
interface ReportService { send(reportId: string): Promise<void> }
const reportServiceToken = createToken<ReportService>('services.reports')

export class SendReport extends Job<SendReportPayload> {
  static readonly tries = 3
  static readonly queue = 'reports'
  static readonly backoff = [1_000, 5_000]

  readonly payload: SendReportPayload

  constructor(payload: Record<string, unknown>) {
    super()
    if (typeof payload.reportId !== 'string') throw new Error('reportId is required')
    this.payload = { reportId: payload.reportId }
  }
  async handle(resolver: Resolver) {
    await resolver.make(reportServiceToken).send(this.payload.reportId)
  }
}
```

Register serialized jobs before a worker rehydrates them, then use the `Queue` contract.

```ts
registry.register(SendReport.name, SendReport)
await queue.push(new SendReport({ reportId: 'report_1' }))
await queue.later(60_000, new SendReport({ reportId: 'report_2' }))
await queue.sync(new SendReport({ reportId: 'report_3' }))
```

| API | Purpose |
|---|---|
| `Job.serialize()` | Produces the versioned queue payload. Override `handle()` and optionally `failed()`. |
| `InMemoryJobRegistry.register()` | Maps a serialized job name to its constructor. |
| `InMemoryJobRegistry.rehydrate()` | Recreates a registered job or throws `JobNotRegisteredError`. |
| `JobRunner.run()` / `failed()` | Runs a serialized job and its failure hook in a scope. |
| `Queue.push()` / `later()` / `sync()` | Enqueues, delays or immediately executes a job. |
| `Queue.size()` / `clear()` | Inspects or clears all jobs, optionally by queue name. |
| `Queue.onFailed()` | Registers a terminal-failure observer. |
| `PushOptions` | Overrides `tries`, `delay`, `queue` and `backoff`. |
| `QueueFake` | Records pushes; use `assertPushed()`, `size()` and `clear()`. |

```ts
import { QueueFake } from '@nuxt-laravelize/queue/testing'

const queue = new QueueFake()
await queue.push(new SendReport({ reportId: 'report_1' }))
queue.assertPushed(SendReport)
```

## BullMQ adapter

`@nuxt-laravelize/queue-bullmq` is an optional Node-only persistent driver; the preset and reliability queue bridge do not install it. Install it with the portable queue and provide an `ioredis` client.

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq bullmq ioredis
```

```ts
import Redis from 'ioredis'
import { BullMQConnection, BullMQQueue, BullMQWorker } from '@nuxt-laravelize/queue-bullmq/runtime'
import { jobSerializerToken } from '@nuxt-laravelize/queue/runtime'

const connection = new BullMQConnection(new Redis(process.env.REDIS_URL!))
const queue = new BullMQQueue(connection, runner, container.make(jobSerializerToken))
const worker = new BullMQWorker(connection, registry, runner)

await queue.push(new SendReport({ reportId: 'report_1' }))
await worker.work('reports', 4)
// During graceful shutdown:
await worker.stop()
await queue.close()
```

`FailureReporter.listen()` observes terminal failures and `report()` notifies registered observers. The worker CLI loads a default-exported `{ worker }` from `laravelize.queue.config.mjs` (or `--config=path`):

```js
// laravelize.queue.config.mjs
import { worker } from './server/queue.js'

export default { worker }
```

```bash
pnpm exec laravelize-queue-work --queue=reports --concurrency=4
```

## Queued event listeners

`@nuxt-laravelize/events-queue` connects listeners marked with `shouldQueue: true` to a queue without coupling the base packages.

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue @nuxt-laravelize/events-queue
```

```ts
class WelcomeUserListener implements Listener<UserRegistered> {
  readonly shouldQueue = true as const
  async handle(event: UserRegistered) { /* send welcome message */ }
}

events.listen(UserRegistered, welcomeUserListenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Purpose |
|---|---|
| `EventRegistry.register()` | Registers serializable event constructors by name. The adapter calls it automatically. |
| `EventRegistry.make(name, args)` | Recreates a registered event from constructor arguments. |
| `QueueListenerAdapter.enqueue()` | Enqueues events that implement `toPayload()` as a `ListenerJob`; returns `false` for other events. |
| `ListenerJob` | Resolves and runs the original listener inside the queue worker. |
| `eventRegistryToken` | Resolves the shared registry. |

## Mail

`@nuxt-laravelize/mail` supplies portable mailables, log and Resend-compatible transports. Nodemailer is isolated in `/node`. `useMailer(event)` is auto-imported in Nitro.

```bash
pnpm add @nuxt-laravelize/mail
```

```ts
import { Mailable } from '@nuxt-laravelize/mail/runtime'

class WelcomeMail extends Mailable {
  constructor(private readonly email: string) { super() }
  to() { return this.email }
  from() { return 'team@example.com' }
  subject() { return 'Welcome' }
  render() { return '<h1>Welcome!</h1>' }
  text() { return 'Welcome!' }
  attachments() { return [{ filename: 'guide.txt', content: 'Getting started' }] }
}

await mailer.send(new WelcomeMail('ada@example.com'))
```

| API | Purpose |
|---|---|
| `Mailable.toMessage()` | Builds a normalized `MailMessage` from the class methods. |
| `LogMailer.send()` | Logs messages without external delivery. |
| `ResendMailer(client, defaultFrom)` | Sends through any client implementing `ResendClient`. |
| `NodemailerMailer(transport, defaultFrom)` | Sends through a Nodemailer-compatible transport from `/node`. |
| `mailerToken` | Resolves the configured `Mailer`. |
| `MailFake` | Records mail; use `assertSent()` and `reset()`. |

## Notifications

`@nuxt-laravelize/notifications` routes notifications through named channels. The base package registers only the log channel and does not pull in mail or queues. `useNotifications(event)` is auto-imported in Nitro.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['log'] as const }
  toLog() { return 'Invoice inv_1 was paid' }
}

const user = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : 'user_1',
}
await notifications.send(user, new InvoicePaid())
```

| API | Purpose |
|---|---|
| `DefaultNotificationManager.register()` | Registers a custom `NotificationChannel`. |
| `send()` / `sendNow()` | Sends to one or many notifiables through `via()`. |
| `route(channel, address)` | Starts an on-demand `PendingNotification`. Chain `.route()` and finish with `.notify()`. |
| `LogChannel.send()` | Logs `notification.toLog()` or `toArray()`. |
| `notificationManagerToken` | Resolves the configured manager. |
| `NotificationFake` | Records notifications and provides predicate, count, negative, and reset assertions. |
| `NotificationDelivered` | Observes a channel invocation that fulfilled. |
| `NotificationDeliveryFailed` | Observes a channel attempt that rejected or was aborted. |

```ts
await notifications
  .route('log', 'user_1')
  .notify(new InvoicePaid())
```

`NotificationFake.assertSentTo()` accepts an optional predicate with the typed notification and the channels selected by `via()`. Tests can also use `assertSentToTimes()`, `assertSentTimes()`, `assertNotSentTo()`, `assertCount()`, `assertNothingSent()`, and `reset()`. The fake records intent without invoking channels or emitting lifecycle events.

When `@nuxt-laravelize/events` is also registered, the manager dispatches privacy-bounded lifecycle events around delivery attempts. Trusted listeners can explicitly access the non-enumerable `notifiable`, `notification`, and failure `error`; generic serialization exposes only the channel, event type, a failure's `aborted` flag, and copied `locale`, `tenantId`, `idempotencyKey`, and `occurredAt` metadata. The events implement no durable or queued payload contract, and listener failures are logged with safe metadata then isolated from the original channel result. Normal dispatcher ordering still applies between observers: a thrown error or `false` return stops later listeners for that event.

`NotificationDelivered` means that the channel method fulfilled: a database write or webhook outbox append was accepted, or a mail/broadcast provider call returned. It does not prove inbox receipt or final webhook HTTP delivery. `NotificationDeliveryFailed` describes one delivery attempt, including a signal already aborted before channel invocation, not exhaustion of queue retries. Missing recipients, disabled channels, malformed queued payloads, and tenant mismatches rejected before manager invocation emit neither event. Worker crashes and at-least-once execution can omit or duplicate observations, so side-effecting listeners must durably deduplicate by tenant, idempotency key, channel, and event type. Do not use these best-effort events as the sole audit ledger; `NotificationFake` does not emit them.

Install `@nuxt-laravelize/notifications-mail` to register the opt-in `mail` channel. A notification implements `toMail()` while the recipient address comes only from `routeNotificationFor('mail')`; content cannot override destinations. The channel accepts one plain address per route entry, rejects header/list injection and bounded-resource violations, and forwards locale, abort signal, and idempotency key to the configured mailer.

Install `@nuxt-laravelize/notifications-database` to register the opt-in `database` channel. Notifications declare explicit `databaseType()`, `databaseVersion()`, and bounded `toDatabase()` JSON; recipients expose an opaque `{ type, id, tenantId? }` route. Tenant scope must match trusted execution context. `useDatabaseNotifications(event)` provides cursor-based listing and tenant-fenced `markRead()` / `markUnread()` operations. Development may use bounded memory, while production requires a durable store such as `@nuxt-laravelize/notifications-database-drizzle`. Idempotent retries suppress identical content and reject conflicting reuse.

Install `@nuxt-laravelize/notifications-broadcast` to register the opt-in `broadcast` channel. Notifications declare explicit `broadcastType()`, `broadcastVersion()`, and bounded `toBroadcast()` JSON; recipients expose an opaque `{ type, id, tenantId? }` route. The package derives one deterministic private channel from the trusted tenant and recipient, and emits a fixed `notification.created` event carrying `{ id, type, version, data, locale? }`. Content cannot override the destination or event. Use `broadcastNotificationChannelName()` for authorization and browser subscription, and configure a server adapter such as `@nuxt-laravelize/broadcasting-pusher` separately. Delivery remains at-least-once at provider boundaries; clients should deduplicate by `id`. This package does not host WebSockets or install a browser client.

Install `@nuxt-laravelize/notifications-webhook` to register the opt-in, Node-only `webhook` channel. Notifications provide `webhookType()`, `webhookVersion()`, and bounded `toWebhook()` JSON while recipients expose only `{ endpointId, tenantId? }`. Bind `webhookNotificationOutboxStoreToken` to a durable shared outbox and `webhookNotificationEndpointResolverToken` to a trusted resolver that queries endpoint ownership by tenant and ID together. Notification content cannot select URLs, headers, or keys; the resolver returns a queryless HTTPS URL and opaque `secretId`, and must prove trusted tenant ownership. Queue replay preserves one ID and occurrence time across inbox and outbox stages. Run `OutgoingWebhookProcessor` separately and resolve signing keys by both `context.tenantId` and `secretId`; require receiver deduplication, revoke endpoint keys when disabling already-published endpoints, and use pinned or allowlisted egress because DNS validation alone cannot eliminate rebinding.

`@nuxt-laravelize/notifications-queue` exposes `QueuedNotificationDispatcher`, explicit type/version codec and recipient-resolver registries, and the versioned `QueuedNotificationJob`. It serializes no route/address or `Notifiable`; workers reload the current recipient, preferences, locale, channels, and trusted tenant before delivering exactly one encoded channel. Missing recipients or disabled channels are skipped, while malformed/unknown versions and tenant mismatch are terminal. A notification may implement `withDelay(notifiable)` and return per-channel delays in whole milliseconds from 0 through 86,400,000; the complete recipient/channel plan is validated before its first job is pushed and delays are applied as queue metadata. An omitted channel keeps the queue backend's default delay, while an explicit `0` overrides it with immediate availability. Direct notification delivery remains immediate. Production requires a durable queue and durable `InboxStore`; use an outbox when enqueue must commit with domain state. Inbox completion suppresses confirmed duplicates, but external providers still determine whether the final effect supports idempotency. Its one-second queue backoff matches the default inbox retry delay so retry attempts do not exhaust while a failed claim is still unavailable. Lifecycle events preserve the queued delivery ID and original occurrence time, but remain attempt-level and non-durable.

## Feature flags

`@nuxt-laravelize/pennant` provides scoped, lazy feature flags with boolean or rich values. The preset registers an in-memory store; replace `featureManagerToken` with a manager backed by a shared `FeatureStore` in distributed deployments.

```ts
const features = useFeatures(event)
features.define('new-checkout', scope => scope.plan === 'pro' ? 'variant-b' : false)
const accountFeatures = features.for({ plan: 'pro', toFeatureIdentifier: () => 'account:42' })
if (await accountFeatures.active('new-checkout')) return { variant: await accountFeatures.value('new-checkout') }
```

Definitions are evaluated only after a store miss and their result is persisted. Use `activate()`, `deactivate()` and `forget()` for one scope, `purge()` for stored rollout data, and `flushCache()` at explicit lifecycle boundaries. Object scopes must implement `toFeatureIdentifier()` to prevent unstable identity from object serialization.

## Scout search

`@nuxt-laravelize/scout` provides portable searchable-model and engine contracts, a fluent builder, bulk import, and the server auto-import `useScout(event)`. Configure `laravelizeScout.driver` (default: `memory`). Engines are named, lazy, and cached; register adapters in an application provider before selecting them. `@nuxt-laravelize/scout-drizzle` provides PostgreSQL, local SQLite, and Turso/libSQL helpers as `/postgres`, `/sqlite`, and `/turso` subpaths.

```ts
const scout = useScout(event)
const results = await scout.search('articles', 'supportive care')
  .where('status', 'published')
  .whereIn('locale', ['en', 'es'])
  .orderBy('published_at', 'desc')
  .paginate(1, 20)

registerDrizzlePostgresDriver(scout, 'postgres', db, {
  filterableFields: ['status', 'locale'],
  sortableFields: ['published_at'],
})
scout.use('postgres')
```

```ts
import { registerDrizzleSQLiteDriver } from '@nuxt-laravelize/scout-drizzle/sqlite'
import { registerTursoDriver } from '@nuxt-laravelize/scout-drizzle/turso'

// Local Drizzle SQLite database (for example drizzle-orm/better-sqlite3)
registerDrizzleSQLiteDriver(scout, 'sqlite', sqliteDb, allowlists)
// @libsql/client-compatible client; batch(..., 'write') is transactional
registerTursoDriver(scout, 'turso', tursoClient, allowlists)
```

Models implement `searchableKey()`, `searchableType()`, and `toSearchableDocument()`. Use `update`, `delete`, `import`, and `flush` for index maintenance. PostgreSQL uses `websearch_to_tsquery` and a GIN-indexed `tsvector`; SQLite/libSQL use FTS5 and JSON1. All engines parameterize values, deny filter/sort fields by default, and make multi-write synchronization atomic where the client supports transactions. Pagination is capped at 100 and imports at 10,000 documents per batch. SQLite/libSQL requires a build with FTS5 enabled; apply `0001_create_scout_documents_sqlite.sql`. Authorize access before calling Scout and do not index secrets or unnecessary personal data.

## Validation

`@nuxt-laravelize/validation` validates any [Standard Schema](https://standardschema.dev/) implementation, including Zod, Valibot and ArkType, without coupling application services to HTTP.

```bash
pnpm add @nuxt-laravelize/validation
```

Use `validate()` when invalid input is exceptional, or `safeValidate()` when the caller owns the control flow.

```ts
const validator = useValidator(event)
const user = await validator.validate(CreateUserSchema, input)

const result = await validator.safeValidate(CreateUserSchema, input, { prefix: 'body' })
if (!result.success) {
  return {
    message: result.errors.first('body.email'),
    errors: result.errors.all(),
  }
}
```

| API | Purpose |
|---|---|
| `validate(schema, input, options?)` | Returns the schema's typed, transformed output or throws `ValidationError`. |
| `safeValidate()` | Returns a discriminated success/error result without throwing. |
| `ErrorBag.first()` / `get()` / `has()` | Reads messages for one dot-notated field. |
| `ErrorBag.all()` / `any()` | Returns a defensive error snapshot or checks if any issue exists. |
| `validatorToken` | Replaces or resolves the shared validator. |

Nested object and array paths become stable dot notation such as `body.users.0.email`; multiple issues for one field preserve schema order. `FormRequest` uses this same validator internally, so standalone validation and HTTP `422` responses share path and message semantics.

Build localized Standard Schema messages when constructing the schema; do not translate vendor issue codes or arbitrary issue strings after validation:

```ts
const i18n = await useServerLocalization(event)
const schema = z.object({ email: z.email({ error: i18n.t('validation.email') }) })
const result = await useValidator(event).safeValidate(schema, input)
```

## HTTP

`@nuxt-laravelize/http` provides the auto-imported Nuxt client `useHttp`, plus requests, middleware, resources, pagination, gates and policies for Nitro.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/http'],
  laravelizeHttp: {
    baseURL: 'https://api.example.com',
    signingKey: '',
    signingOrigin: 'https://app.example.com',
  },
})
```

Generate at least 32 random bytes with `openssl rand -base64 32` and set the private key through `NUXT_LARAVELIZE_HTTP_SIGNING_KEY`. Never place it under `runtimeConfig.public` or commit a production key. `signingOrigin` gives validation a canonical, allowlisted origin instead of trusting request `Host` and forwarded-protocol headers.

```ts
const { data, error, status, refresh } = await useHttp<User>('/users/1')
const { data: created } = await useHttp<User>('/users', {
  method: 'POST',
  body: { name: 'Ada' },
})
```

### Form requests and handlers

`FormRequest.body()`, `query()` and `params()` accept any Standard Schema implementation. `authorize(event)` returns a boolean. `defineLaravelizedHandler()` resolves a controller token, runs global and route middleware, validates input and serializes resources.

The example uses Zod as the Standard Schema implementation: `pnpm add zod`.

```ts
import { createToken } from '@nuxt-laravelize/core/runtime'
import { FormRequest, LengthAwarePaginator, Resource, defineLaravelizedHandler, type ValidatedInput } from '@nuxt-laravelize/http/runtime'
import { z } from 'zod'

class CreateUserRequest extends FormRequest {
  body() { return z.object({ name: z.string().min(1) }) }
  authorize() { return true }
}

class UserResource extends Resource<{ id: string, name: string }> {
  toArray() { return { id: this.resource.id, name: this.resource.name } }
}

class UserController {
  async store(input: ValidatedInput<CreateUserRequest>) {
    return new UserResource({ id: 'user_1', name: input.body.name })
  }
}

const userControllerToken = createToken<UserController>('controllers.users')

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'store',
  request: CreateUserRequest,
})
```

Implement `Middleware.handle(event, next)` and register its token in the handler's `middleware` array. `globalMiddlewareToken` stores middleware tokens applied to every Laravelized handler.

### Signed and temporary URLs

`HmacUrlSigner` protects the origin, path and query with HMAC-SHA256. The configured service is available through `useUrlSigner(event)` and `urlSignerToken`.

```ts
// server/api/invitations/[id]/link.get.ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const target = new URL(`/api/invitations/${getRouterParam(event, 'id')}`, signingOrigin)
  const url = await useUrlSigner(event).sign(target, {
    expiresAt: Date.now() + 30 * 60 * 1000,
  })
  return { url }
})
```

Protect a Laravelized handler with the auto-imported `validateSignatureToken`:

```ts
export default defineLaravelizedHandler({
  controller: invitationControllerToken,
  method: 'accept',
  middleware: [validateSignatureToken],
})
```

Use the same middleware in an ordinary Nitro handler:

```ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const middleware = new ValidateSignature(useUrlSigner(event), { origin: signingOrigin })
  return await middleware.handle(event, async () => ({ accepted: true }))
})
```

| API | Purpose |
|---|---|
| `HmacUrlSigner(secret)` | Creates a portable Web Crypto HMAC-SHA256 signer. Keys shorter than 32 bytes throw `MissingUrlSigningKeyError`. |
| `sign(url, options?)` | Replaces an existing signature; options support expiration, relative mode and HTTP method binding. |
| `hasValidSignature(url, options?)` | Rejects missing, malformed, modified or expired signatures and can require expiration. |
| `ValidateSignature` | Middleware that rejects invalid requests with HTTP 403; it supports canonical origin, required expiration and method binding. |
| `urlSignerToken` / `useUrlSigner(event)` | Resolves the configured signer from the request container. |
| `validateSignatureToken` | Default absolute-signature middleware; resolving it requires configured `signingOrigin`. |

Absolute signing is the default and includes the origin. For proxy-independent links, call both signing and validation with `{ absolute: false }`; relative mode protects only path and query and must not cross host-based tenant boundaries. Query order is canonicalized, fragments are ignored because browsers do not send them to the server, and a temporary URL is invalid at its exact expiration second. Rotating the key invalidates existing links.

Signed URLs are bearer credentials and are replayable. Use short expirations for verification, invitation and state-changing links; bind those signatures to the HTTP method with `sign(..., { method: 'POST' })` and `new ValidateSignature(signer, { bindMethod: true, requireExpiration: true })`. Enforce HTTPS at a trusted proxy and use application storage when a link must be single-use.

### HTTP idempotency

`@nuxt-laravelize/idempotency` provides an opt-in H3 middleware and an atomic store contract for mutating requests. It fingerprints the method, canonical route and query, principal, content type, and exact request bytes. Reusing a key with another fingerprint returns `409`; active leases are renewed and stale owners cannot complete reclaimed work. Completed responses are replayed with an allowlist of safe headers. Failures are retained by default because retrying after an ambiguous application error can duplicate committed side effects.

```ts
import { createIdempotencyMiddleware } from '@nuxt-laravelize/idempotency/runtime'

const idempotency = createIdempotencyMiddleware({
  principal: event => event.context.user.id,
})
```

The memory driver is volatile and must be explicitly enabled. Clustered and serverless deployments must bind an atomic durable `IdempotencyStore`. Streaming and direct response writes are rejected because they cannot be replayed faithfully.

For durable storage, `@nuxt-laravelize/idempotency-drizzle` provides PostgreSQL, SQLite, and Turso adapters plus schemas and explicit migrations. PostgreSQL accepts Drizzle's `execute(SQL)` boundary; SQLite/Turso accept `all(SQL)` so conditional `UPSERT/UPDATE ... RETURNING` statements return the fenced row. Apply exactly one matching migration before binding the store token.

```ts
import { DrizzlePostgresIdempotencyStore } from '@nuxt-laravelize/idempotency-drizzle/postgres'

container.singleton(idempotencyStoreToken, () => new DrizzlePostgresIdempotencyStore(db))
```

The `signature` and `expires` query names are reserved. Signing replaces `signature`; pass `expiresAt` explicitly to create or replace `expires`.

### Resources and pagination

| API | Purpose |
|---|---|
| `Resource.toArray(event)` | Transforms one value. Use protected `when()` and `mergeWhen()` for conditional fields. |
| `Resource.collection(items)` | Creates a normal or paginated resource collection. |
| `withoutWrapping()` / `restoreWrapping()` | Globally disables or restores the `{ data: ... }` wrapper. |
| `ResourceCollection.toArray()` | Serializes every resource. |
| `LengthAwarePaginator` | Adds totals, page metadata and links; `fromRequest()` reads query parameters. |
| `SimplePaginator` | Provides previous/next links without a total count. |
| `CursorPaginator` | Provides encoded cursor navigation. |
| `parsePageParams()` / `parseCursorParams()` | Reads and bounds request pagination parameters. |
| `encodeCursor()` / `decodeCursor()` | Converts cursor objects to and from URL-safe strings. |
| `buildPageUrl()` / `buildCursorUrl()` / `getRequestPath()` | Builds links while preserving the request path and query. |
| `isPaginator()` and resource guards | Narrow paginator and resource values at runtime. |

```ts
const paginator = LengthAwarePaginator.fromRequest(event, users, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})
return UserResource.collection(paginator)
```

### Gates and policies

These HTTP gate/policy APIs remain for concrete backward compatibility. New code should use `@nuxt-laravelize/authorization`; unlike the legacy constructor-name policy lookup and caller-supplied user argument below, it uses explicit resource keys and reloads the scoped principal. The legacy `authorize()` keeps its H3-specific 403 mapping.

| API | Purpose |
|---|---|
| `define(rule, callback)` | Registers an authorization rule. |
| `allows()` / `denies()` | Checks one rule. |
| `authorize()` | Throws an H3 403 error when denied. |
| `any()` / `none()` | Checks multiple rules. |
| `DefaultPolicyRegistry.register(modelName, policy)` | Registers a policy for a model constructor name. |
| `Policy.before(user)` | Optionally allows or denies every action before its method runs. |
| `discoverPoliciesByConvention(rootDir)` | Finds policy files for adapter registration. |

```ts
import { InMemoryGate } from '@nuxt-laravelize/http/runtime'

const gate = new InMemoryGate()
gate.define('update-invoice', (user, invoice) => user.id === invoice.ownerId)
await gate.authorize('update-invoice', currentUser, invoice)
```

## Database

`@nuxt-laravelize/database` provides ORM-neutral factories, seeders, and explicit transaction/unit-of-work contracts. Your application supplies persistence callbacks or adapters; relationships are composed explicitly without ORM metadata.

```bash
pnpm add @nuxt-laravelize/database
```

```ts
import { Factory, builtInFaker, recycle } from '@nuxt-laravelize/database/runtime'

interface UserDraft { name: string, email: string, active: boolean, teamId?: string }

class UserFactory extends Factory<UserDraft, number> {
  protected definition(): UserDraft {
    return {
      name: this.faker.string.word(),
      email: `${this.faker.string.sample()}@example.com`,
      active: true,
    }
  }
}

const teams = recycle([{ id: 'team-a' }, { id: 'team-b' }])
const ids = await new UserFactory(builtInFaker({ seed: 42, now: Date.UTC(2025, 0, 1) }))
  .count(3)
  .state({ active: false })
  .sequence([(_draft, index) => ({ name: `User ${index}` })])
  .for(teams, (_user, team) => ({ teamId: team.id }))
  .beforeCreate(validateUser)
  .afterCreate(id => auditCreatedUser(id))
  .create({ persist: draft => userRepository.insert(draft) })

// Existing callback persistence still returns drafts.
const draft = await new (class extends Factory<UserDraft> {
  protected definition(): UserDraft { return { name: 'Ada', email: 'ada@example.com', active: true } }
})().create(async (draft) => {
  await db.insert(users).values(draft)
})
```

| API | Purpose |
|---|---|
| `Factory<TDraft, TPersisted = TDraft>.count()` | Sets and types the scalar (`1`) or array (`>1`) result cardinality. |
| `state()` | Applies a partial value or indexed mutator to every item. |
| `sequence()` | Cycles indexed item-specific states. |
| `for(factoryOrRecycle, composer)` | Composes one explicit parent/recycled value into each root. |
| `has(factory, composer)` | Composes the related factory scalar or array into each root. |
| `recycle(values)` | Creates a non-empty, frozen local pool that cycles by root index. |
| `make(overrides?)` | Builds values without persistence. |
| `create(callback, overrides?)` | Sequentially persists and returns drafts for callback compatibility. |
| `create(adapter, overrides?)` | Sequentially returns typed persisted records or IDs from `FactoryPersistenceAdapter`. |
| `beforeCreate()` / `afterCreate()` | Registers ordered async-capable hooks around each persistence call. |
| `builtInFaker(seedOrOptions?)` | Returns `FakerShim`; `{ seed, now }` fixes random and date output. |
| `DefaultFactoryRegistry` | Provides `register`, `list`, `has` and `resolve`. |
| `DefaultSeederRegistry` | Provides the same operations for async seeder factories. |
| `Seeder.call(name)` | Runs another seeder registered in the same registry. |
| `discoverSeedersByConvention(rootDir)` | Finds seeder files for adapters and CLIs. |

Factory composition always runs definition -> states -> sequence -> `for` -> `has` -> call-site overrides. For every created item it then runs draft -> all before hooks -> persistence -> all after hooks, sequentially and fail-fast. `make()` is synchronous and intentionally does not run lifecycle hooks. A reused related factory keeps its configured count/state and restarts its local sequence index for every root while its Faker stream advances normally; there is no hidden recycle pool. A `for()` factory must produce exactly one item, while `has()` preserves its configured scalar/array shape. Relationship composers must return a root object or partial root object.

```ts
import { DefaultSeederRegistry, Seeder } from '@nuxt-laravelize/database/runtime'

class UserSeeder extends Seeder {
  async run() { await new UserFactory().create(saveUser) }
}

class DatabaseSeeder extends Seeder {
  async run() { await this.call('users') }
}

const seeders = new DefaultSeederRegistry()
seeders.register('users', () => new UserSeeder())
seeders.register('database', () => new DatabaseSeeder())
await (await seeders.resolve('database')).run()
```

The seeder CLI loads provider factories from `laravelize.seed.config.mjs` (or `--config=path`). Providers must register `seederRegistryToken` and the requested seeders.

```js
// laravelize.seed.config.mjs
import DatabaseServiceProvider from './server/providers/DatabaseServiceProvider.js'

export default {
  providers: [() => new DatabaseServiceProvider()],
}
```

```bash
pnpm exec laravelize-db-seed --class=database
```

Omit `--class` to run every registered seeder in registry order.

### Transactions and unit of work

```ts
import { DrizzleTransactionManager } from '@nuxt-laravelize/database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  await outbox.appendIn(unitOfWork, envelope)
  unitOfWork.afterCommit(() => metrics.increment('orders.created'))
})
```

Repositories receive `unitOfWork.session` explicitly, so domain writes and outbox records can share the physical transaction. Call `unitOfWork.markRollbackOnly(error)` when a caught inner failure must still abort the transaction. Transaction managers throw before native commit and skip `afterCommit` hooks whenever rollback-only is marked; custom implementations must provide the same guarantee. `afterCommit` hooks otherwise run only after a confirmed commit, and a hook failure cannot roll the commit back. Use `DrizzleSyncTransactionManager` for synchronous SQLite drivers: it deliberately rejects Promise-returning work instead of allowing async work to escape the native transaction.

## Workflows and sagas

`@nuxt-laravelize/workflows` implements persisted, linear workflows with versioned definitions, fenced renewable leases, retries, restart-safe attempts, cooperative in-flight cancellation, and reverse-order compensation.

Versions are opaque, case-sensitive strings of 1–64 ASCII characters, with alphanumeric ends and `[A-Za-z0-9._-]` interiors; `latest`, `default`, and `current` are reserved case-insensitively. Resolution is exact, without fallback, latest aliases, or ranges. Never change handlers or steps under a published tuple; assign a new version. New source snapshots require `snapshotFormatVersion: 1`. Diagnostic `status` normalizes a legacy missing field and rejects unknown formats without requiring a deployed definition; execution exact-resolves even terminal/waiting rows before claim or mutation.

This persisted-row validation is breaking. Before upgrade, stop every workflow writer and take a verified backup. Audit **every row**, not only identifiers, with the new validator and exact historical definitions: relational/JSON identity and exact definition/step names; timestamp monotonicity; workflow/step ordering; required outputs, errors, and `retryAt`; retry/compensation counters versus deployed `maxAttempts`; lease validity; and 128/4096 error bounds. Previous-release error strings are bounded on authoritative reads and missing JSON format remains format 1, but neither compatibility path repairs any other invariant. Migrate relational columns and snapshot JSON atomically from an explicit reviewed mapping, then rerun dry validation. Rows from custom/untrusted stores need application-specific repair or archival; automatic in-flight migration remains unsupported.

Old `completed|failed + cancellationRequested` race rows are explicitly rejected and must not be silently normalized. Review each incident and either perform/verify compensation before marking `cancelled`/`compensated`, or document rejection of cancellation before clearing the flag; never blindly clear it. The workflows-drizzle README includes PostgreSQL discovery queries. After repair, dual-register old and new valid definitions everywhere and retain historical versions while any row or outstanding queue job/wake references them.

```ts
const fulfill = defineWorkflow({
  name: 'orders.fulfill',
  version: '1',
  steps: [
    defineStep({ name: 'reserve', run: reserve, compensate: release }),
    defineStep({ name: 'charge', run: charge, compensate: refund }),
  ],
})

registry.register(fulfill)
const started = await workflows.start(fulfill, { orderId }, orderId)
await workflows.run(started.id)
```

The included in-memory store is volatile and intended for tests or local development. Production stores must implement atomic revision and lease fencing, including `renewLease()`. Configure `leaseDurationMs` and a shorter `heartbeatIntervalMs`; handler contexts receive `signal`, cancellation is observed at heartbeat cadence, and stale results are discarded after lease loss. Signals cannot undo accepted external effects, so handlers remain at-least-once and require stable idempotency keys.

`@nuxt-laravelize/workflows-drizzle` supplies durable PostgreSQL, SQLite, and Turso stores. Workflow identity and canonical input are immutable; relational revision, cancellation and lease columns override serialized snapshots during hydration. Claims and commits are conditional row-returning statements, and stale or expired owners are fenced before state can be persisted. These stores also implement the optional `RecoverableWorkflowStore` capability, returning non-terminal IDs in bounded `(updatedAt, id)` cursor pages.

```ts
import { DrizzlePostgresWorkflowStore } from '@nuxt-laravelize/workflows-drizzle/postgres'

const workflows = new WorkflowManager(new DrizzlePostgresWorkflowStore(db), registry)
```

### Transactional outbox wake-ups

`@nuxt-laravelize/workflows-reliability` atomically records each workflow mutation and its future wake-up in the reliability outbox. Atomicity requires the workflow adapter, outbox adapter, and `TransactionManager` to use the same physical database transaction and connection.

```ts
const workflowStore = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(workflowStore, registry)
registerWorkflowWakeHandler(reliableHandlers, workflows)
```

The registration helper owns the wake-up message type and version while accepting any structurally compatible reliability registry; it forwards the reliability execution signal without coupling persistence to a queue transport. Creation emits an immediate wake-up. Every claim and renewal records a fallback at lease expiry, released non-terminal commits emit at once or at their retry deadline, and cancellation emits immediately. Renewal and replacement fallback share one transaction and do not change workflow revision.

To join an existing domain transaction, call `workflows.using(workflowStore.in(unitOfWork)).start(...)`. This writes domain state, workflow state, and outbox wake-up together without opening a nested transaction. Never wrap all of `processResult()` in one transaction: handlers may perform slow external effects between the engine's persisted boundaries. External effects remain at least once and still require their stable idempotency keys.

Run `new WorkflowWakeReconciler(durableWorkflowStore, durableReliabilityStore, { resolver: registry }).reconcileStore({ pageSize: 100 })` periodically to repair dead or operationally lost wake-ups. The exact resolver is required and must match workers. The bounded scan reloads authoritative state and schedules after any active lease or business retry deadline. Repeated and concurrent scans of an unchanged workflow share one deterministic wake per 60-second generation; configure `generationMs` when a different recovery-latency bound is required. Later generations use fresh IDs, so recovery never revives or mutates an old dead row. Use `reconcile(ids)` with an application-owned index. Per-workflow failures are returned without aborting later pages.

For a long-lived process, `new WorkflowWakeReconciliationWorker(reconciler, { intervalMs: 60_000, reconcile: { pageSize: 100 }, onResult })` runs immediately and then waits after each completed scan. It coalesces overlapping local calls and drains an active scan on abort. Per-workflow failures are reported through `onResult`; discovery and callback errors stop the loop. Deterministic IDs keep multiple processes safe, although a single leader avoids redundant scans.

Deploy it with `workflow-wake-reconcile --config ./workflow-wake-reconciliation.config.js`, or add `--once` for cron. The ESM config must default-export `{ worker, close? }`; `close` runs only after active reconciliation drains. The default config path is `workflow-wake-reconciliation.config.js` in the current directory. Signals trigger one graceful shutdown, while configuration, discovery, callback, drain, and cleanup errors exit non-zero.

When the same outbox contains other protocols, configure the dedicated `OutboxProcessor` with `types: [workflowWakeMessageType]`. Type-filtered claiming prevents a workflow queue delivery adapter from racing webhook or unrelated message workers.

Run `DATABASE_URL=postgresql://... pnpm test:integration:postgres` to execute the required real-PostgreSQL proof in an isolated temporary schema. It verifies joint commit, rollback on outbox failure, caller-owned rollback across domain, workflow, and outbox rows, and fresh recovery while retaining the dead row. The target fails when `DATABASE_URL` is absent rather than silently skipping.

### Queue scheduling

`@nuxt-laravelize/workflows-queue` schedules one authoritative workflow transition per queue job. Payloads contain only the workflow ID; workers reload the store and claim by revision and lease. Business retry deadlines create delayed successor jobs, while queue retries are reserved for transport, store, and publication failures.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/workflows-queue'],
  laravelizeWorkflowsQueue: { queue: 'workflows', tries: 5, backoff: 5000 },
})

await useWorkflows(event).start(fulfill, { orderId }, orderId)

// Run periodically from your scheduler or operational worker.
await useWorkflows(event).reconcileStore({ pageSize: 100 })
```

Bind `workflowStoreToken` to a durable store and register definitions through `workflowRegistryToken`. Deterministic revision-based job IDs optimize transport deduplication, but correctness relies on store fencing, so duplicate jobs remain harmless. Persistence and publication are separate operations: run `reconcileStore()` periodically when the store supports recovery discovery, or call `reconcile(ids)` with IDs from a custom index. Every store scan captures an `updatedBefore` boundary so concurrent updates cannot make one pass unbounded; later passes pick up newer changes. This bridge does not claim transactional-outbox guarantees.

Queue and wake payloads remain ID-only so old jobs reload the relationally authoritative tuple rather than carrying stale or attacker-controlled version metadata. Enqueue/reconciliation preflight exact definitions and continue after reporting unsupported IDs; handlers independently fail closed before claim. Wake reconcilers require `{ resolver: registry }`, using the same registry as workers.

## Testing

`@nuxt-laravelize/testing` aggregates the official fakes and mounts them in a sealed container.

```bash
pnpm add -D @nuxt-laravelize/testing
```

```ts
import { mountLaravelize } from '@nuxt-laravelize/testing'

const app = mountLaravelize()
await app.cache.put('feature:user_1', true, 60)
await app.events.dispatch(new UserRegistered('user_1'))
await app.queue.push(new SendReport({ reportId: 'report_1' }))
await app.mail.send(new WelcomeMail('ada@example.com'))

app.events.assertDispatched(UserRegistered)
app.queue.assertPushed(SendReport)
app.mail.assertSent(WelcomeMail)
await app.cache.assertHas('feature:user_1')
```

`mountLaravelize()` returns `container`, `cache`, `encrypter`, `events`, `features`, `filesystem`, `hasher`, `queue`, `mail`, `notifications`, `rateLimiter` and `validator`. The package also re-exports `CacheFake`, `EventFake`, `FakeLogger`, `FilesystemFake`, `QueueFake`, `MailFake` and `NotificationFake` for focused tests.

## Console

`@nuxt-laravelize/console` registers typed commands without a global command facade. `CommandRegistry` rejects duplicate names; argument and option schemas own parsing, defaults, aliases, validation, and help. `ConsoleRunner` creates one Laravelize application scope per invocation, binds a `cli` execution context, propagates abort signals, records bounded logs/spans, normalizes exit codes, and always disposes the scope. The portable entrypoint never reads process globals. Use `/node` for TTY/process adapters and `/testing` for deterministic terminal, prompt, and process fakes. Prompts fail closed unless an interactive adapter is installed.

```ts
const registry = new CommandRegistry().register(defineCommand({
  name: 'reports:send',
  arguments: { report: argument.string() },
  options: { queue: option.string({ short: 'q' }) },
  handler: sendReportHandlerToken,
}))

const exitCode = await new ConsoleRunner({ application, registry, terminal, process }).run()
```

## Migrations

`@nuxt-laravelize/migrations` is ORM-neutral. Sources are explicit and IDs are namespaced as `namespace:name`; no dependency scanning occurs. Before mutation the runner validates dialects, dependencies, cycles, duplicate IDs, applied history, and checksums. `up`, `rollback`, `reset`, and `fresh` select work while holding the backend lock, and each migration statement plus its history update runs in the same transaction. Irreversible migrations refuse rollback. `fresh` requires an exact ownership allowlist and never introspects unrelated objects.

`@nuxt-laravelize/migrations-drizzle` provides PostgreSQL and SQLite backends. PostgreSQL requires a pinned connection provider so advisory locking, SQL, and history share one session and transaction. SQLite uses callback-local immediate transactions. `migrationSourcesFor(dialect)` explicitly aggregates audit, idempotency, reliability, Scout, and workflow sources. Application sources can be loaded from caller-supplied paths with `discoverApplicationMigrations()`.

```ts
const runner = new MigrationRunner({
  dialect: 'postgresql',
  backend: new PostgresMigrationBackend(connectionProvider),
  sources: [...migrationSourcesFor('postgresql'), appMigrations],
})

await runner.up()
```

The `/console` entrypoint supplies `migrate:status`, `migrate:up`, `migrate:rollback`, `migrate:reset`, `migrate:fresh`, and `migrate:pretend`. Destructive commands require an affirmative interactive prompt.

## Scheduler

`@nuxt-laravelize/scheduler` defines immutable framework-neutral schedules. It is not part of the Nuxt preset. `@nuxt-laravelize/scheduler-nuxt` is the opt-in Nuxt 4 adapter and compiles explicit declarations into Nuxt-owned Nitro 2 tasks; it never installs or replaces Nitro.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'

const schedule = defineSchedule((schedule) => {
  schedule.operation('reports:hourly').hourly().withoutOverlapping(30)
  schedule.dispatch('search:sync', { job: 'search:sync', queue: 'maintenance' }).everyFiveMinutes().onOneServer()
  schedule.task('reports:daily').timezone('America/New_York').dailyAt('02:30')
  schedule.task('billing:weekdays').cron('0 8 * * 1-5')
})

console.log(schedule.all())
```

Schedules support common cron helpers, IANA timezones, queue dispatch, `withoutOverlapping`, `onOneServer`, maintenance behavior, and named success/failure hooks. Timezone tasks use a minute trigger plus a DST-safe due-time guard on providers that only accept UTC cron. Nuxt-generated wrappers execute through `SchedulerRunner` and an application-provided runtime scope. `/cache-lock` adapts a capability-verified Redis/Valkey cache: `onOneServer` renews one owner-atomic occurrence claim while work runs, releases caught failures for retry, and resets the full retention TTL after success; `withoutOverlapping` uses a separate renewable owner-checked lease. Every lock-backed runner requires a stable application-and-environment `namespace`; set `occurrenceRetentionSeconds` to cover maximum execution plus the provider replay window. A process crash leaves the claim until TTL recovery. Process-local locks and providers without owner-atomic occurrence claims are rejected for `onOneServer`.

Execution is at least once around ambiguous application or cleanup failures. Use stable occurrence-based idempotency keys for operations, queue dispatch, and hooks. Lease loss aborts the exposed execution signal and rejects completion, but cooperative cancellation cannot undo external side effects; use database fencing where duplicate writes are unacceptable.

Provider trigger generation remains Nitro-owned. This integration supports Nuxt `>=4.4.5 <5`; verify that the selected Nitro preset supports scheduled tasks. Standard Nitro 2 task invocations do not propagate Cloudflare or Vercel scheduled-event timestamps, so module-generated wrappers always use an advancing wall clock. Only low-level `createGeneratedSchedulerTask(..., { timestampSource: 'event' })` calls may opt into an explicitly supplied immutable occurrence timestamp; the standalone Cloudflare adapter accepts `ScheduledController.scheduledTime`. Set a strong `CRON_SECRET` on every Vercel production deployment so Nitro authenticates generated cron endpoints. Never expose Nitro development task endpoints or wrap `runTask()` in an unauthenticated production route.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { compileSchedule, defineScheduledOperation, runScheduledTask } from '@nuxt-laravelize/scheduler/nitro3'

export default defineScheduledOperation('reports:daily', {
  execute: async payload => generateReport(String(payload.reportId ?? 'daily')),
}, 'Generate the daily report')

const nitroSchedule = defineSchedule((schedule) => {
  schedule.task('reports:daily').dailyAt('02:30')
})

const compiled = compileSchedule(nitroSchedule, {
  'reports:daily': { handler: './tasks/reports' },
})

await runScheduledTask('reports:daily', { reportId: 'report_1' })
```

Merge `compiled` into a standalone Nitro 3 configuration. Actual scheduling support depends on the selected Nitro deployment preset. This minimal adapter accepts plain operation schedules only and rejects timezone, queue dispatch, overlap/one-server, maintenance-override, and hook policies instead of silently ignoring them.

## Public entrypoints

| Package | Runtime entrypoints | Testing entrypoint |
|---|---|---|
| `cache` | `/runtime` | `/testing` |
| `core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `events` | `/runtime` | `/testing` |
| `queue` | `/runtime` | `/testing` |
| `queue-bullmq` | `/runtime` | - |
| `reliability` | package root | `/testing` |
| `reliability-drizzle` | package root, `/postgres`, `/sqlite`, `/turso` | - |
| `dead-letter` | package root | `/testing` |
| `reliability-queue` | package root, `/runtime` | - |
| `routes` | package root, `/runtime`, `/kit` | - |
| `events-queue` | `/runtime` | - |
| `mail` | `/runtime`, `/node` | `/testing` |
| `notifications` | `/runtime` | `/testing` |
| `http` | `/runtime` | - |
| `database` | `/runtime` | - |
| `console` | package root, `/node` | `/testing` |
| `migrations` | package root, `/console` | `/testing` |
| `migrations-drizzle` | package root, `/postgres`, `/sqlite`, `/sources` | `/testing` |
| `testing` | package root | package root |
| `scheduler` | package root, `/nitro3` | - |
| `scheduler-nuxt` | package root, `/runtime`, `/adapters`, `/compiler`, `/cache-lock` | - |
| `webhooks` | package root | `/testing` |
| `workflows` | package root | - |
| `workflows-drizzle` | package root, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `workflows-reliability` | package root | - |
| `workflows-queue` | package root, `/runtime` | - |
| `nuxt` | package root, `/runtime/server` | - |
## Execution Context

`@nuxt-laravelize/execution-context` gives every Nitro request an immutable, validated, JSON-safe context. `useExecutionContext(event)` returns the request-scoped value. Incoming correlation IDs are accepted only when `trustIncomingCorrelationHeader` is explicitly enabled and valid; actor and tenant headers are never trusted. Attributes are limited to 16 string entries of 256 characters. The optional canonical BCP 47 `locale` is bounded to 35 characters, resolved by server localization for HTTP requests, preserved by `create`, `derive`, `enrich`, and queue propagation, and recorded as a first-class audit field.

Use `snapshot()` for transport, `derive()` for child work, authenticated `enrich()` for actor/tenant, and `withExecutionContext()` for sanitized logs. A transported snapshot is correlation provenance and **MUST NOT** be used to authorize its actor or tenant. HTTP handlers pass their request context explicitly when dispatching: `runWithExecutionContext(useExecutionContext(event), () => queue.push(job))`. The queue bridge preserves correlation, creates a worker execution ID, and sets causation to the producer execution ID; the same registered `JobSerializer` must be passed to persistent queue adapters.
## Observability and OpenTelemetry

`@nuxt-laravelize/observability` is included in the preset as a zero-cost no-op foundation. Its runtime contracts do not depend on H3. Application providers may override `observabilityToken`; register the override after module providers. `@nuxt-laravelize/observability-otel` and `@nuxt-laravelize/observability-queue` remain opt-in. The OTel adapter uses only `@opentelemetry/api` at runtime and never installs globals, an SDK, or exporters.

Incoming HTTP trace trust is disabled by default. Baggage is always discarded. Built-in integrations never capture payloads, bodies, raw URLs/query, secrets, arbitrary headers, IPs, error messages/stacks, or actor/tenant/workflow/message/job IDs as metric labels. IDs are not captured by default. Metric dimensions are fixed; job and queue names require explicit allowlists and otherwise become `other`.

Queue consumers also start root spans by default. Set `trustTraceContext: true` only for trusted queue carriers when remote parenting is intended. Queue metadata persists only `traceparent`; `tracestate` requires `propagateTracestate: true`, and baggage is never persisted. Terminal job failure callbacks are not process spans. When execution-context propagation is installed too, observability replaces only trace/span correlation and preserves the worker execution identity and provenance.

Nitro lifecycle hooks reliably start and finish request spans. The request-scoped observability token binds Laravelize services, `useObservability(event)`, `observe()`, and queue producer injection to that server span. This is not global handler ALS: arbitrary external auto-instrumentation that bypasses the token is not parented by this mechanism.
