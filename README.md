# nuxt-laravelize

English | [Español](./README.es.md)

Nuxt 4 module that brings Laravel-inspired architecture primitives to Nuxt and Nitro: per-request DI container, auto-discovered service providers, single-action controllers with validation, events, queues, mail, notifications, pagination, policy-based authorization, logging, i18n, seeding, and testing helpers — all wired around the CodelyTV-style DDD layout.

## The Laravelize stack

| Package | Role |
|---|---|
| **[`@luckys_luis/nuxt-laravelize`](./)** *(this one)* | Runtime — DI container, controllers, queues, mail, notifications, i18n, policies, seeders, factories, testing helpers. |
| [`@luckys_luis/nuxt-ddd-toolkit`](../nuxt-ddd-toolkit) | Toolchain — 12-rule DDD ESLint plugin, scaffolding CLI (`laravelize new:*`), shared presets, 15 AI skills with auto-link. |

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [DI Container & Tokens](#di-container--tokens)
- [Service Providers](#service-providers)
- [Controllers & Form Requests](#controllers--form-requests)
- [Middleware](#middleware)
- [API Resources](#api-resources)
- [Pagination](#pagination)
- [Events](#events)
- [Queue & Jobs](#queue--jobs)
- [Authorization (Gate & Policies)](#authorization-gate--policies)
- [Logging](#logging)
- [Mail](#mail)
- [Notifications](#notifications)
- [Localization (i18n)](#localization-i18n)
- [Database: Seeders & Factories](#database-seeders--factories)
- [Testing helpers](#testing-helpers)
- [Server composables](#server-composables)
- [CLIs (bins)](#clis-bins)
- [Feature map](#feature-map)
- [Development](#development)
- [License](#license)

---

## Installation

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

**Required peers:** `nuxt >= 4.0.0`, `h3 >= 1.0.0`

**Optional peers** (install only what you use):

```bash
pnpm add zod                 # or valibot — for FormRequest validation
pnpm add bullmq ioredis      # for BullMQ queue driver
pnpm add nodemailer          # for NodemailerMailer
pnpm add resend              # for ResendMailer
pnpm add @faker-js/faker     # for Factory faker integration
```

---

## Quick start

1. Add the module to your Nuxt config:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize'],
})
```

2. Define a controller token and contract:

```ts
// server/controllers/userTokens.ts
import { createToken } from '#imports' // auto-imported

export interface UserControllerContract {
  find(input: { body: undefined, query: undefined, params: { id: string } }): UserResource
}

export const userControllerToken = createToken<UserControllerContract>('app.user-controller')
```

3. Implement the controller:

```ts
// server/controllers/UserController.ts
import { createError } from 'h3'
import { UserResource } from '../resources/UserResource'

export class UserController implements UserControllerContract {
  find(input: { body: undefined, query: undefined, params: { id: string } }) {
    const user = db.find(input.params.id)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    return new UserResource(user)
  }
}
```

4. Register it in a service provider:

```ts
// server/providers/UserControllerProvider.ts
import type { Container } from '#imports'
import type { ServiceProvider } from '#imports'

import { UserController } from '../controllers/UserController'
import { userControllerToken } from '../controllers/userTokens'

export default class UserControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(userControllerToken, () => new UserController())
  }
}
```

5. Create a Form Request with Zod validation:

```ts
// server/requests/FindUserRequest.ts
import { z } from 'zod'
import { FormRequest } from '#imports'

export class FindUserRequest extends FormRequest {
  override params() {
    return z.object({ id: z.string() })
  }
}
```

6. Wire it all together in a Nitro route:

```ts
// server/api/users/[id].get.ts
import { userControllerToken } from '../../controllers/userTokens'
import { FindUserRequest } from '../../requests/FindUserRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'find',
  request: FindUserRequest,
})
```

That's it. When a `GET /api/users/123` hits your server, Laravelize will:

1. Resolve the request-scoped DI container
2. Run global middleware + any per-route middleware
3. Validate route params against the Zod schema (422 on failure)
4. Resolve `UserController` from the container
5. Call `controller.find({ params: { id: '123' }, body: undefined, query: undefined })`
6. Serialize the returned `UserResource` to JSON

---

## DI Container & Tokens

Laravelize wraps [awilix](https://github.com/jeffijoe/awilix) with a type-safe `Token<T>` system. Each request gets a scoped container; providers register bindings during boot.

### Creating tokens

```ts
import { createToken } from '#imports'

// Type-safe — the token carries its type at compile time
export const userRepositoryToken = createToken<UserRepository>('app.user-repository')
export const loggerToken = createToken<Logger>('app.logger')
```

### Binding lifetimes

```ts
import type { Container } from '#imports'

export default class AppProvider implements ServiceProvider {
  register(container: Container): void {
    // New instance per resolve (default)
    container.bind(userRepositoryToken, () => new InMemoryUserRepository())

    // Single shared instance across the entire app
    container.singleton(loggerToken, () => new ConsoleLogger())

    // One instance per request scope (resets each request)
    container.scoped(userControllerToken, resolver => new UserController(
      resolver.make(userRepositoryToken),
    ))

    // Register a pre-built value
    container.instance(configToken, { apiUrl: 'https://api.example.com' })
  }
}
```

### Resolving from the container

```ts
// Inside a route handler — use the request-scoped container
const container = useContainer(event)
const repo = container.make(userRepositoryToken)

// Inside a provider factory — use the resolver argument
container.scoped(userControllerToken, (resolver) => {
  return new UserController(resolver.make(userRepositoryToken))
})
```

### Scopes & sealing

```ts
// Create a child scope (inherits parent registrations)
const scope = container.createScope()

// Seal the container — prevents further registrations
// (called automatically by the Kernel after all providers boot)
container.seal()
```

---

## Service Providers

Providers follow Laravel's two-phase lifecycle: **register** (bind things) → **boot** (use things).

```ts
import type { Container } from '#imports'
import type { ServiceProvider } from '#imports'
import { dispatcherToken, InMemoryDispatcher } from '#imports'

export default class EventsProvider implements ServiceProvider {
  // Phase 1: register bindings — only bind, don't use other services
  register(container: Container): void {
    container.singleton(dispatcherToken, resolver => new InMemoryDispatcher(resolver))
    container.bind(sendWelcomeEmailToken, () => new SendWelcomeEmailListener())
  }

  // Phase 2: boot — all registrations are available, safe to wire things up
  boot(container: Container): void {
    const dispatcher = container.make(dispatcherToken)
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
  }
}
```

### Auto-discovery

Providers in `server/providers/*.ts` (or `server/contexts/**/infrastructure/*ServiceProvider.ts`) are auto-discovered and booted by the Kernel.

---

## Controllers & Form Requests

### `defineLaravelizedHandler`

Wraps a controller method into an h3 `EventHandler` with middleware, authorization, validation, and resource serialization.

```ts
// server/api/posts.post.ts
export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'create',
  request: CreatePostRequest,
  middleware: [authMiddlewareToken], // optional per-route middleware
})
```

### Form Requests

Extend `FormRequest` and override any of `body()`, `query()`, `params()`, or `authorize()`. Validation uses [Standard Schema v1](https://github.com/standard-schema/standard-schema) — compatible with Zod, Valibot, ArkType, and more.

```ts
import { z } from 'zod'
import { FormRequest } from '#imports'
import { gateToken } from '#imports'
import { useContainer } from '#imports'

export class CreatePostRequest extends FormRequest {
  // Validate request body
  override body() {
    return z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    })
  }

  // Validate query string
  override query() {
    return z.object({
      draft: z.boolean().optional().default(false),
    })
  }

  // Authorization gate — runs BEFORE validation
  // Return false → 403 Forbidden
  override async authorize(event: H3Event): Promise<boolean> {
    const gate = useContainer(event).make(gateToken)
    const user = event.context.user
    if (!user) return false
    return await gate.allows('create-post', user)
  }
}
```

### Validation error format

When validation fails, the response is HTTP 422 with a Laravel-compatible body:

```json
{
  "message": "Validation failed",
  "errors": {
    "body.title": ["String must contain at least 1 character(s)"],
    "body.content": ["String must contain at least 1 character(s)"]
  }
}
```

### Using Valibot instead of Zod

```ts
import { object, string, minLength } from 'valibot'
import { FormRequest } from '#imports'

export class CreateUserRequest extends FormRequest {
  override body() {
    return object({
      email: string([minLength(1)]),
      name: string([minLength(1)]),
    })
  }
}
```

---

## Middleware

Middleware follows the Koa-style pipeline: each middleware receives `(event, next)` and can run code before/after the next handler.

### Defining middleware

```ts
import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'
import type { Middleware } from '#imports'

export class LoggingMiddleware implements Middleware {
  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const start = Date.now()
    const response = await next()
    setResponseHeader(event, 'x-response-time', `${Date.now() - start}ms`)
    return response
  }
}
```

### Registering global middleware

```ts
import { globalMiddlewareToken } from '#imports'

export default class MiddlewareProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(loggingMiddlewareToken, () => new LoggingMiddleware())

    // These run on every laravelized handler
    container.instance(globalMiddlewareToken, [loggingMiddlewareToken])
  }
}
```

### Per-route middleware

```ts
export default defineLaravelizedHandler({
  controller: protectedControllerToken,
  method: 'index',
  middleware: [blockingMiddlewareToken], // added on top of global middleware
})
```

---

## API Resources

Resources transform your domain models into JSON-friendly arrays, mirroring Laravel's `JsonResource`.

### Single resource

```ts
import type { H3Event } from 'h3'
import { Resource } from '#imports'

interface User { id: string, email: string, name: string }

export class UserResource extends Resource<User> {
  override toArray(event: H3Event): Record<string, unknown> {
    return {
      id: this.resource.id,
      email: this.resource.email,
      name: this.resource.name,
    }
  }
}
```

### Nested resources

```ts
export class PostResource extends Resource<Post> {
  override toArray(_event: H3Event): Record<string, unknown> {
    const author = findAuthor(this.resource.authorId)
    return {
      id: this.resource.id,
      title: this.resource.title,
      // Nested resources are serialized recursively
      author: author ? new UserResource(author) : null,
    }
  }
}
```

### Resource collections

```ts
// From an array
const collection = UserResource.collection(users)
// → ResourceCollection<UserResource>

// From a paginator
const paginated = UserResource.collection(paginator)
// → PaginatedResourceCollection<UserResource>
```

### Returning resources from controllers

Resources are auto-serialized by `defineLaravelizedHandler` — just return them:

```ts
export class UserController {
  find(input): Resource<User> {
    return new UserResource(user)
  }

  list(input): PaginatedResourceCollection<UserResource> {
    return UserResource.collection(paginator)
  }
}
```

---

## Pagination

Three paginator types matching Laravel's pagination primitives.

### LengthAwarePaginator (offset-based, knows total)

```ts
import { LengthAwarePaginator } from '#imports'

// Manual construction
const paginator = new LengthAwarePaginator(items, total, perPage, currentPage)

// From request — reads `page` and `per_page` from query string
const paginator = LengthAwarePaginator.fromRequest(event, items, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})

// Meta + links output (snake_case, Laravel-compatible)
paginator.toMeta(event)  // { current_page, from, last_page, path, per_page, to, total }
paginator.toLinks(event) // { first, last, prev, next }
```

### SimplePaginator (no total count)

```ts
import { SimplePaginator } from '#imports'

const paginator = SimplePaginator.fromRequest(event, items, hasMore)
```

### CursorPaginator (cursor-based, most efficient)

```ts
import { CursorPaginator } from '#imports'

const paginator = CursorPaginator.fromRequest(
  event,
  items,
  nextCursorKey,  // string | null — the key of the last item
  prevCursorKey,  // string | null — the key of the first item
)

// Cursor is base64url-encoded in the URL: ?cursor=eyJrZXki...
```

### Paginated resource response

```ts
export class UserController {
  list(input) {
    const paginator = LengthAwarePaginator.fromRequest(event, slice, total)
    return UserResource.collection(paginator)
  }
}
// Output: { data: [...], links: { first, last, prev, next }, meta: { current_page, ... } }
```

---

## Events

### Defining events

```ts
// server/events/UserRegistered.ts
export class UserRegistered {
  constructor(public readonly userId: string) {}

  // Required for queued listeners — serializes constructor args
  toPayload(): readonly unknown[] {
    return [this.userId]
  }
}
```

### Defining listeners

```ts
import type { Listener } from '#imports'
import type { UserRegistered } from '../events/UserRegistered'

export class SendWelcomeEmailListener implements Listener<UserRegistered> {
  handle(event: UserRegistered): void {
    console.log(`Sending welcome email to user ${event.userId}`)
  }
}

// Queued listener — pushed to the queue instead of running inline
export class ProcessRegistrationListener implements Listener<UserRegistered>, ShouldQueue {
  readonly shouldQueue = true as const

  async handle(event: UserRegistered): Promise<void> {
    // Runs inside a queue worker
  }
}
```

### Registering listeners

```ts
export default class EventsProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(dispatcherToken, resolver => new InMemoryDispatcher(resolver))
    container.bind(sendWelcomeEmailToken, () => new SendWelcomeEmailListener())
  }

  boot(container: Container): void {
    const dispatcher = container.make(dispatcherToken)
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
  }
}
```

### Wildcard listeners

```ts
dispatcher.listenAny(anyEventLoggerToken) // receives every dispatched event
```

### Event subscribers

```ts
import type { Dispatcher, EventSubscriber } from '#imports'

export class UserSubscriber implements EventSubscriber {
  subscribe(dispatcher: Dispatcher): void {
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
    dispatcher.listen(UserRegistered, logUserRegistrationToken)
    dispatcher.listenAny(anyEventLoggerToken)
  }
}

// Register in boot
dispatcher.subscribe(userSubscriberToken)
```

### Dispatching events

```ts
export class UserController {
  readonly #dispatcher: Dispatcher

  constructor(dispatcher: Dispatcher) {
    this.#dispatcher = dispatcher
  }

  async register(input) {
    const user = create(input.body)
    await this.#dispatcher.dispatch(new UserRegistered(user.id))
    return user
  }
}
```

---

## Queue & Jobs

### Defining jobs

```ts
import { Job } from '#imports'

export class ProcessVideoJob extends Job {
  static override readonly tries = 3
  static override readonly queue = 'default'
  static override readonly backoff = 1000 // ms

  constructor(public readonly videoId: string) {
    super()
  }

  async handle(): Promise<void> {
    await transcodeVideo(this.videoId)
  }

  serialize(): { name: string, args: readonly unknown[] } {
    return { name: 'ProcessVideoJob', args: [this.videoId] }
  }
}
```

### Dispatching jobs

```ts
import { queueToken } from '#imports'

// From a controller
const queue = container.make(queueToken)
await queue.push(new ProcessVideoJob('video-123'))

// Delayed dispatch
await queue.later(5000, new ProcessVideoJob('video-456')) // 5 second delay

// With per-push options
await queue.push(new ProcessVideoJob('video-789'), {
  tries: 5,
  delay: 2000,
  queue: 'videos',
  backoff: 3000,
})
```

### Queue drivers

**InMemoryQueue** (dev/test — default):

```ts
import { InMemoryQueue } from '#imports'

container.singleton(queueToken, resolver =>
  new InMemoryQueue(resolver, resolver.make(jobRegistryToken)),
)
```

**BullMQQueue** (production):

```ts
import { BullMQQueue } from '#imports'
import { BullMQConnection } from '#imports'

const connection = new BullMQConnection({ host: 'localhost', port: 6379 })
container.singleton(queueToken, () => new BullMQQueue(connection))
```

### Job registry

Jobs must be registered so the queue worker can rehydrate them from serialized payloads:

```ts
import { InMemoryJobRegistry } from '#imports'
import { ListenerJob } from '#imports'

const registry = new InMemoryJobRegistry()
registry.registerJob('ProcessVideoJob', ProcessVideoJob)
registry.registerJob('laravelize.ListenerJob', ListenerJob)
registry.registerEvent('UserRegistered', UserRegistered) // for queued event listeners
container.singleton(jobRegistryToken, () => registry)
```

### Running the queue worker

```bash
# CLI bin
laravelize-queue-work --queue=default --concurrency=4
```

---

## Authorization (Gate & Policies)

### Defining gates

```ts
import { InMemoryGate } from '#imports'

container.singleton(gateToken, () => {
  const gate = new InMemoryGate()
  gate.define('create-post', (user) => {
    return (user as { role: string }).role === 'author'
  })
  gate.define('update-post', (user, post) => {
    return post.authorId === user.id
  })
  return gate
})
```

### Using gates

```ts
const gate = container.make(gateToken)

// Boolean checks
const canCreate = await gate.allows('create-post', user)
const cannotEdit = await gate.denies('update-post', user, post)

// In a FormRequest
override async authorize(event: H3Event): Promise<boolean> {
  const gate = useContainer(event).make(gateToken)
  return await gate.allows('create-post', event.context.user)
}
```

### Defining policies

```ts
import { Policy } from '#imports'

interface User { id: string, admin: boolean }
interface Invoice { customerId: string, status: 'paid' | 'draft' }

export class InvoicePolicy extends Policy<User, Invoice> {
  // Runs before any policy method — return true/false to short-circuit, null to defer
  override before(user: User): boolean | null {
    return user.admin ? true : null
  }

  view(user: User, invoice: Invoice): boolean {
    return invoice.customerId === user.id
  }

  update(user: User, invoice: Invoice): boolean {
    return invoice.status !== 'paid' && invoice.customerId === user.id
  }
}
```

### Registering & auto-discovering policies

```ts
import { DefaultPolicyRegistry } from '#imports'

// Manual registration
const registry = new DefaultPolicyRegistry()
registry.register('Invoice', new InvoicePolicy())

// Convention-based discovery — scans server/policies/*.policy.ts
const policies = discoverPoliciesByConvention(process.cwd())
```

### How gate + policy interact

When you call `gate.allows('view', user, invoice)`:

1. Gate checks if the last argument is an object with a constructor name
2. Looks up a policy for that model name in the registry
3. If found, runs `policy.before(user)` — `true`/`false` short-circuits, `null` falls through
4. Calls `policy.view(user, invoice)` — the method matching the rule name
5. If no policy matches, falls back to the gate's closure-based rules

---

## Logging

### Loggers

```ts
import { ConsoleLogger, StructuredLogger, FileLogger } from '#imports'

// Console output with [LEVEL] prefix
const console = new ConsoleLogger({ threshold: 'info' })

// JSON lines to stdout (for ELK/Datadog etc.)
const structured = new StructuredLogger({
  threshold: 'info',
  serviceName: 'my-app',
  sink: process.stdout,
})

// File with size-based rotation (10 MiB default)
const file = new FileLogger({
  path: '/var/log/app.log',
  threshold: 'debug',
  maxBytes: 10 * 1024 * 1024,
})
```

### Log levels

```ts
logger.debug('Detailed info for debugging')
logger.info('Something happened', { userId: '123' })
logger.warn('Something unusual', { attempts: 3 })
logger.error('Something failed', { error: err.message })
logger.critical('System is down', { service: 'db' })
```

### Registering the logger

```ts
container.singleton(loggerToken, () => new StructuredLogger({ serviceName: 'api' }))
```

### Using the logger in services

```ts
import { loggerFor } from '#imports'

// Safe lookup — falls back to ConsoleLogger if not registered
const logger = loggerFor(resolver)
logger.info('Queue job processed', { jobId })
```

---

## Mail

### Defining mailables

```ts
import { Mailable } from '#imports'

export class WelcomeMail extends Mailable {
  constructor(
    private readonly toEmail: string,
    private readonly name: string,
  ) {
    super()
  }

  override to(): string { return this.toEmail }
  override from(): string { return 'no-reply@example.com' }
  override subject(): string { return `Welcome, ${this.name}` }
  override render(): string { return `<p>Hello ${this.name}</p>` }
  override text(): string { return `Hello ${this.name}` }
}
```

### Mail drivers

```ts
import { LogMailer, NodemailerMailer, ResendMailer } from '#imports'

// Log driver (dev/test — writes to logger instead of sending)
container.singleton(mailerToken, resolver =>
  new LogMailer(resolver.make(loggerToken)))

// Nodemailer (SMTP)
container.singleton(mailerToken, () =>
  new NodemailerMailer(transport, 'default@example.com'))

// Resend (API)
container.singleton(mailerToken, () =>
  new ResendMailer(resendClient, 'default@example.com'))
```

### Sending mail

```ts
const mailer = container.make(mailerToken)
await mailer.send(new WelcomeMail('ada@example.com', 'Ada'))
```

---

## Notifications

### Defining notifications

```ts
import { Notification } from '#imports'

export class InvoicePaidNotification extends Notification {
  constructor(private readonly invoiceId: string) {
    super()
  }

  // Determine which channels to use per notifiable
  override via(notifiable: Notifiable): readonly ChannelName[] {
    return notifiable.routeNotificationFor('mail')
      ? ['mail', 'log']
      : ['log']
  }

  // Optional — required for mail channel
  override toMail(notifiable: Notifiable): Mailable {
    return new InvoicePaidMail(notifiable.routeNotificationFor('mail')!, this.invoiceId)
  }

  // Optional — for log channel
  override toLog(notifiable: Notifiable): string {
    return `Invoice ${this.invoiceId} paid for ${notifiable.constructor.name}`
  }
}
```

### Notifiables

```ts
import type { Notifiable } from '#imports'

class User implements Notifiable {
  constructor(
    readonly id: string,
    readonly email: string,
  ) {}

  routeNotificationFor(channel: ChannelName): string | null {
    if (channel === 'mail') return this.email
    if (channel === 'queue') return this.id
    return null
  }
}
```

### Sending notifications

```ts
const notifier = container.make(notificationManagerToken)
await notifier.send(user, new InvoicePaidNotification('inv-123'))
```

### Queue channel

The `queue` channel defers delivery by pushing a `SendNotificationJob`:

```ts
// The queue channel automatically:
// 1. Filters out 'queue' from via() (prevents infinite loop)
// 2. Serializes the notification + notifiable identity
// 3. Pushes a SendNotificationJob to the queue
// 4. Worker rehydrates and dispatches to the remaining channels
```

### Custom channels

```ts
notifier.register('slack', new SlackChannel(webhookUrl))
await notifier.send(user, new NotificationWithSlack())
```

---

## Localization (i18n)

### Setting up the translator

```ts
import { DictionaryTranslator } from '#imports'

const translator = new DictionaryTranslator({
  dictionaries: {
    en: {
      'messages.welcome': 'Welcome, :name',
      'messages.apples': 'There is one apple|There are many apples',
    },
    es: {
      'messages.welcome': 'Bienvenido, :name',
      'messages.apples': 'Hay una manzana|Hay muchas manzanas',
    },
  },
  locale: 'en',
  fallbackLocale: 'en',
})

container.singleton(translatorToken, () => translator)
```

### Translating

```ts
const t = container.make(translatorToken)

t.__('messages.welcome', { name: 'Ada' })
// → "Welcome, Ada"

t.choice('messages.apples', 1)
// → "There is one apple"

t.choice('messages.apples', 10)
// → "There are many apples"
```

### Changing locale at runtime

```ts
t.setLocale('es')
t.__('messages.welcome', { name: 'Ada' })
// → "Bienvenido, Ada"
```

### Pluralization

The pipe-delimited format supports up to 3 forms (zero / one / many):

```
'{0} There are none|{1} There is one|[2,*] There are :count'
```

```ts
t.choice('messages.apples', 0)  // → "There are none"
t.choice('messages.apples', 1)  // → "There is one"
t.choice('messages.apples', 10) // → "There are 10" (:count auto-injected)
```

---

## Database: Seeders & Factories

### Seeders

```ts
import { Seeder } from '#imports'

export class DemoUserSeeder extends Seeder {
  async run(): Promise<void> {
    await db.insert(users).values([
      { id: '1', email: 'ada@example.com', name: 'Ada Lovelace' },
      { id: '2', email: 'grace@example.com', name: 'Grace Hopper' },
    ])
  }
}
```

### Running seeders

```bash
# CLI bin
laravelize-db-seed --class=DemoUserSeeder

# Convention-based discovery — scans server/database/seeders/*.seeder.ts
```

### Factories

```ts
import { Factory } from '#imports'

interface User { id: string, email: string, name: string, active: boolean }

export class UserFactory extends Factory<User> {
  protected definition(): User {
    return {
      id: this.faker.string.uuid(),
      email: this.faker.internet.email(),
      name: this.faker.person.fullName(),
      active: true,
    }
  }

  // Custom state methods
  suspended() {
    return this.state({ active: false })
  }
}
```

### Using factories

```ts
const factory = new UserFactory()

// Build without persisting
const user = factory.make()        // → single User
const users = factory.count(5).make() // → User[]

// Build + persist
const user = await factory.create(async (u) => {
  await db.insert(users).values(u)
})

// With overrides (last wins)
const admin = factory.make({ active: true, name: 'Admin' })

// With states
const suspended = factory.suspended().make()
const suspendedBatch = factory.suspended().count(3).make()
```

### Factory registry

```ts
import { DefaultFactoryRegistry } from '#imports'

const registry = new DefaultFactoryRegistry()
registry.register('User', () => new UserFactory())
container.singleton(factoryRegistryToken, () => registry)
```

---

## Testing helpers

Import from the `./testing` subpath:

```ts
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize/testing'
```

### Mounting the test harness

```ts
const harness = await mountLaravelize({
  // Optionally boot real providers
  providers: [EventsProvider, QueueProvider],

  // Enable fakes for any subsystem
  fakes: {
    dispatcher: true,      // FakeDispatcher
    queue: true,           // FakeQueue
    mailer: true,          // FakeMailer
    notifications: true,   // FakeNotificationManager
    logger: true,          // FakeLogger
  },
})
```

### Asserting on events

```ts
await useCase.execute({ id: '123' })

harness.dispatcher!.assertDispatched(UserRegistered)
harness.dispatcher!.assertDispatched(UserRegistered, (e) => e.userId === '123')
harness.dispatcher!.assertNotDispatched(PaymentFailed)
harness.dispatcher!.assertNothingDispatched()
```

### Asserting on queued jobs

```ts
harness.queue!.assertQueued(ProcessVideoJob)
harness.queue!.assertQueued(ProcessVideoJob, (entry) => entry.job.videoId === 'vid-1')
harness.queue!.assertNothingQueued()
```

### Asserting on mail

```ts
harness.mailer!.assertMailed(WelcomeMail)
harness.mailer!.assertMailed(WelcomeMail, (mailable) => {
  return mailable.to() === 'ada@example.com'
})
harness.mailer!.assertNothingMailed()
```

### Asserting on notifications

```ts
harness.notifications!.assertSentTo(user, InvoicePaidNotification)
harness.notifications!.assertSent(InvoicePaidNotification, (entry) => {
  return entry.notifiable === user
})
harness.notifications!.assertNothingSent()
```

### Asserting on logs

```ts
expect(harness.logger!.hasMessage('info', 'mail dispatched')).toBe(true)

// Inspect raw records for richer queries
expect(harness.logger!.records.filter(r => r.level === 'error')).toHaveLength(2)
```

### Full test example

```ts
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize/testing'
import { UserRegistered } from '../events/UserRegistered'
import { WelcomeMail } from '../mail/WelcomeMail'

describe('UserRegistration use case', () => {
  it('dispatches event and sends welcome email', async () => {
    const harness = await mountLaravelize({
      fakes: { dispatcher: true, mailer: true, logger: true },
    })

    const useCase = new RegisterUser(harness.container.make(dispatcherToken))
    await useCase.execute({ email: 'ada@example.com', name: 'Ada' })

    harness.dispatcher!.assertDispatched(UserRegistered, (e) => e.userId !== '')
    harness.mailer!.assertMailed(WelcomeMail, (m) => m.to() === 'ada@example.com')
    expect(harness.logger!.hasMessage('info', 'mail dispatched')).toBe(true)
  })
})
```

---

## Server composables

All auto-imported in server routes:

| Composable | Returns | Description |
|---|---|---|
| `useContainer(event)` | `Container` | Request-scoped DI container |
| `useLogger(event)` | `Logger` | Logger instance from container |
| `useMailer(event)` | `Mailer` | Mailer instance from container |
| `useNotifier(event)` | `NotificationManager` | Notification manager from container |
| `useTranslator(event)` | `Translator` | Translator instance from container |

---

## CLIs (bins)

### Queue worker

```bash
laravelize-queue-work --queue=default --concurrency=4
```

Runs a persistent BullMQ worker that dequeues jobs, rehydrates them via the `JobRegistry`, and executes `handle()`.

### Database seeder

```bash
laravelize-db-seed --class=DemoUserSeeder
```

For scaffolding (contexts, aggregates, use cases…), install `@luckys_luis/nuxt-ddd-toolkit` and use `pnpm laravelize new:*`.

---

## Feature map

| Area | Main symbols | Server helper |
|---|---|---|
| Container | `Container`, `Token`, `createToken` | `useContainer(event)` |
| Providers | `ServiceProvider`, `Kernel` | auto-discovery |
| Controllers | `defineLaravelizedHandler`, `FormRequest`, `Resource` | — |
| Middleware | `Middleware`, `runMiddlewarePipeline`, `globalMiddlewareToken` | — |
| Events | `Dispatcher`, `Listener`, `EventSubscriber`, `ShouldQueue`, `dispatcherToken` | — |
| Queue | `Queue`, `InMemoryQueue`, `BullMQQueue`, `Job`, `QueueWorker`, `queueToken` | — |
| Pagination | `LengthAwarePaginator`, `CursorPaginator`, `SimplePaginator` | — |
| Auth | `Gate`, `Policy`, `PolicyRegistry`, `gateToken` | — |
| Logging | `Logger`, `ConsoleLogger`, `StructuredLogger`, `FileLogger`, `loggerToken` | `useLogger(event)` |
| Mail | `Mailable`, `Mailer`, `LogMailer`, `NodemailerMailer`, `ResendMailer`, `mailerToken` | `useMailer(event)` |
| Notifications | `Notification`, `Notifiable`, `MailChannel`, `LogChannel`, `QueueChannel`, `notificationManagerToken` | `useNotifier(event)` |
| i18n | `Translator`, `DictionaryTranslator`, `translatorToken` | `useTranslator(event)` |
| Seeding | `Seeder`, `SeederRegistry`, `discoverSeedersByConvention` | bin `laravelize-db-seed` |
| Factories | `Factory<T>`, `FactoryRegistry`, `builtInFaker` | — |
| Testing | `mountLaravelize`, `FakeDispatcher`, `FakeQueue`, `FakeMailer`, `FakeNotificationManager`, `FakeLogger` | subpath `./testing` |

---

## Development

```bash
pnpm install
pnpm dev:prepare    # build stubs + prepare playground
pnpm dev            # spin the playground at localhost:3000
pnpm test           # vitest (342 tests)
pnpm typecheck      # vue-tsc --noEmit
pnpm lint           # eslint
```

### Playground

The `playground/` directory contains a working Nuxt app demonstrating all features. Browse the routes at:

- `GET /api/users` — paginated list with `LengthAwarePaginator`
- `GET /api/users/:id` — single resource with `FormRequest` param validation
- `POST /api/users` — body validation with Zod
- `POST /api/users/register` — event dispatch + queued listener
- `GET /api/users-cursor` — cursor-based pagination
- `GET /api/posts` — authorization gate in `FormRequest`
- `GET /api/protected` — per-route middleware

### Release flow

```bash
pnpm lint && pnpm test && pnpm typecheck
pnpm prepack
pnpm publish
```

---

## License

MIT
