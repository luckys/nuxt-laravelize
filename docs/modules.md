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

`FailureReporter.listen()` observes terminal failures and `report()` notifies registered observers. The declared worker CLI is not included in the `0.2.0` tarball; start `BullMQWorker` from your process lifecycle until that entrypoint is published.

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
  laravelizeHttp: { baseURL: 'https://api.example.com' },
})
```

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

The declared seeder CLI is not included in the `0.2.0` tarball; resolve and run the seeder from your application lifecycle until that entrypoint is published.

## Testing

`@nuxt-laravelize/testing` aggregates the official fakes and mounts them in a sealed container.

```bash
pnpm add -D @nuxt-laravelize/testing
```

```ts
import { mountLaravelize } from '@nuxt-laravelize/testing'

const app = mountLaravelize()
await app.events.dispatch(new UserRegistered('user_1'))
await app.queue.push(new SendReport({ reportId: 'report_1' }))
await app.mail.send(new WelcomeMail('ada@example.com'))

app.events.assertDispatched(UserRegistered)
app.queue.assertPushed(SendReport)
app.mail.assertSent(WelcomeMail)
```

`mountLaravelize()` returns `container`, `events`, `queue`, `mail` and `notifications`. The package also re-exports `FakeLogger`, `EventFake`, `QueueFake`, `MailFake` and `NotificationFake` for focused tests.

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
