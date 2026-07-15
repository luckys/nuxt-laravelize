# Module and API guide

[Espanol](./modules.es.md) | English

This guide covers every public Nuxt Laravelize package. Imports from paths not listed here are internal and may change without notice.

## Nuxt preset

Install `@nuxt-laravelize/nuxt` when you want the stable modules and `nuxt-i18n-micro` configured together. BullMQ and the experimental scheduler are intentionally excluded.

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

`@nuxt-laravelize/events` dispatches events synchronously and resolves listeners from the container.

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
| `EventFake` | Records events and provides `assertDispatched`, `assertNotDispatched` and `reset`. |

```ts
import { EventFake } from '@nuxt-laravelize/events/testing'

const events = new EventFake()
await events.dispatch(new UserRegistered('user_1'))
events.assertDispatched(UserRegistered, event => event.userId === 'user_1')
```

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

`@nuxt-laravelize/queue-bullmq` is a Node-only persistent driver. Install it with the portable queue and provide an `ioredis` client.

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq bullmq ioredis
```

```ts
import Redis from 'ioredis'
import { BullMQConnection, BullMQQueue, BullMQWorker } from '@nuxt-laravelize/queue-bullmq/runtime'

const connection = new BullMQConnection(new Redis(process.env.REDIS_URL!))
const queue = new BullMQQueue(connection, runner)
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
| `NotificationFake` | Records notifications and provides `assertSentTo()`. |

```ts
await notifications
  .route('log', 'user_1')
  .notify(new InvoicePaid())
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

`@nuxt-laravelize/database` provides ORM-neutral factories and seeders. Your application supplies persistence callbacks.

```bash
pnpm add @nuxt-laravelize/database
```

```ts
import { Factory } from '@nuxt-laravelize/database/runtime'

interface UserDraft { name: string, email: string, active: boolean }

class UserFactory extends Factory<UserDraft> {
  protected definition(): UserDraft {
    return {
      name: this.faker.string.word(),
      email: `${this.faker.string.sample()}@example.com`,
      active: true,
    }
  }
}

const drafts = new UserFactory()
  .count(3)
  .state({ active: false })
  .sequence([{ name: 'Ada' }, { name: 'Grace' }])
  .make()

await new UserFactory().create(async (draft) => {
  await db.insert(users).values(draft)
})
```

| API | Purpose |
|---|---|
| `Factory.count()` | Sets the number returned by `make()` or `create()`. |
| `state()` | Applies a partial value or mutator to every item. |
| `sequence()` | Cycles item-specific states. |
| `make(overrides?)` | Builds values without persistence. |
| `create(persister, overrides?)` | Builds values and awaits the supplied persistence callback. |
| `builtInFaker()` | Returns the lightweight built-in `FakerShim`. |
| `DefaultFactoryRegistry` | Provides `register`, `list`, `has` and `resolve`. |
| `DefaultSeederRegistry` | Provides the same operations for async seeder factories. |
| `Seeder.call(name)` | Runs another seeder registered in the same registry. |
| `discoverSeedersByConvention(rootDir)` | Finds seeder files for adapters and CLIs. |

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

`mountLaravelize()` returns `container`, `cache`, `encrypter`, `events`, `filesystem`, `hasher`, `queue`, `mail`, `notifications` and `rateLimiter`. The package also re-exports `CacheFake`, `EventFake`, `FakeLogger`, `FilesystemFake`, `QueueFake`, `MailFake` and `NotificationFake` for focused tests.

## Scheduler

`@nuxt-laravelize/scheduler` defines framework-neutral schedules. It is not part of the Nuxt preset. The experimental `/nitro3` adapter requires exactly `nitro@3.0.260610-beta` and must not replace Nuxt 4's Nitro dependency.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'

const schedule = defineSchedule((schedule) => {
  schedule.task('reports:hourly').hourly()
  schedule.task('cleanup:daily').daily()
  schedule.task('reports:daily').dailyAt('02:30')
  schedule.task('billing:weekdays').cron('0 8 * * 1-5')
})

console.log(schedule.all())
```

`Schedule.task()` returns a `PendingSchedule`. Finish it with `cron()`, `hourly()`, `daily()` or `dailyAt()`. Invalid five-field cron expressions throw `InvalidCronExpressionError`.

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

Merge `compiled` into a standalone Nitro 3 configuration. Actual scheduling support depends on the selected Nitro deployment preset.

## Public entrypoints

| Package | Runtime entrypoints | Testing entrypoint |
|---|---|---|
| `cache` | `/runtime` | `/testing` |
| `core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `events` | `/runtime` | `/testing` |
| `queue` | `/runtime` | `/testing` |
| `queue-bullmq` | `/runtime` | - |
| `events-queue` | `/runtime` | - |
| `mail` | `/runtime`, `/node` | `/testing` |
| `notifications` | `/runtime` | `/testing` |
| `http` | `/runtime` | - |
| `database` | `/runtime` | - |
| `testing` | package root | package root |
| `scheduler` | package root, `/nitro3` | - |
| `nuxt` | package root | - |
