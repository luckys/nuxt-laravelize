# F4: Queue / Jobs — Design Spec

**Status:** Approved
**Date:** 2026-05-25
**Phase:** F4 (Queue)
**Depends on:** F0 (container / providers), F3 (Events — replaces ShouldQueue's `queueMicrotask` path)

## 1. Goal

Bring Laravel-style Jobs and Queues to `@luckys_luis/nuxt-laravelize`: a `Queue` interface with two drivers (in-memory for tests/dev, BullMQ for production), a `Job` base class with static metadata (`tries`, `delay`, `queue`, `backoff`), a `JobRegistry` for rehydration across process boundaries, a `QueueWorker` wrapping BullMQ, and a `pnpm queue:work` CLI for production workers. F3's `ShouldQueue` listeners route through the `Queue` automatically when registered; otherwise they fall back to F3's `queueMicrotask` behavior.

## 2. Scope

**In scope (MVP — "Completo"):**
- `Job` abstract base class with `handle()` and `serialize()` plus statics `tries` / `delay` / `queue` / `backoff`.
- `Queue` interface: `push(job, options?)` / `later(delay, job, options?)` / `size(queueName?)` / `clear(queueName?)`.
- `InMemoryQueue` (default driver) — drains via microtask, in-process, supports retry within the process.
- `BullMQQueue` (production driver) — wraps BullMQ, lazy per-queue init, options mapped to BullMQ.
- `JobRegistry` with `registerJob` / `registerEvent` / `rehydrateJob` / `getEvent`.
- `ListenerJob` — internal Job used by the dispatcher to enqueue ShouldQueue listeners.
- `QueueWorker` — wraps BullMQ Worker, resolves rehydrated jobs through the container.
- CLI `pnpm queue:work [--queue=...] [--concurrency=...]`.
- Module options: `queue: { driver, redis?, queues? }`.
- Backward compatibility: dispatcher falls back to `queueMicrotask` when `queueToken` is not registered. F3 tests remain green.

**Out of scope (deferred):**
- Job middleware / unique jobs / chains / batches.
- Multi-driver simultaneous use (one app, one driver).
- BullMQ Flow Producer.
- Dashboard / metrics endpoint (Bull-Board integration).
- Cluster / horizontal scaling helpers.
- Cron / scheduled jobs (Laravel Scheduler).
- Encryption of job payloads.
- Live config reload.

## 3. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Relation to F3 ShouldQueue | F4 replaces it — dispatcher pushes ListenerJob when queueToken is registered |
| MVP scope | "Completo": Job + Queue + Worker + retry/delay/failure |
| Job shape | Class with `handle()` + constructor props |
| Job metadata | Static readonly props on class + optional per-push override |
| Queue API | `push` / `later` / `size` / `clear` |
| Worker model | BullMQ-based, started by CLI `pnpm queue:work` |
| Abstraction | `Queue` interface + `BullMQQueue` (prod) + `InMemoryQueue` (tests/dev) |
| Rehydration | Explicit `JobRegistry.registerJob(name, ctor)` + `{name, args}` payload |
| Worker boot | CLI script (separate Node process); no inline Nitro-plugin worker |
| Dispatcher integration | Detect ShouldQueue → `queue.push(new ListenerJob({listenerTokenKey, eventName, eventArgs}))` |

## 4. Architecture

New bounded context:

```
src/queue/
├── Job.ts
├── Queue.ts
├── QueueToken.ts
├── JobRegistry.ts
├── JobRegistryToken.ts
├── InMemoryJobRegistry.ts
├── InMemoryQueue.ts
├── BullMQQueue.ts
├── BullMQConnection.ts
├── BullMQConnectionToken.ts
├── ListenerJob.ts
├── QueueWorker.ts
├── QueueWorkerToken.ts
├── errors.ts                  # JobNotRegisteredError, EventNotRegisteredError, BullMQNotInstalledError
└── index.ts
```

**Cross-cutting changes:**
- `src/events/InMemoryDispatcher.ts` — modify `dispatch` so ShouldQueue listeners check for `queueToken` and push a `ListenerJob`; fall back to `queueMicrotask` when no queue is registered. The dispatcher must also auto-register the event constructors it encounters with the `JobRegistry` (lazy — on `listen` call).
- `src/module.ts` — accept `queue: { driver, redis?, queues? }` options; auto-import `./runtime/server/queue`.

**New CLI entry point:**
- `bin/queue-work.ts` — executable script that loads the project bootstrap, resolves `queueWorkerToken`, and calls `worker.work(queueName, concurrency)`. Handles SIGINT to call `worker.stop()`.

**Dependencies (new, peer/optional):**
- `bullmq` (required only when `driver: 'bullmq'`).
- `ioredis` (transitive of bullmq).

**Runtime flow (driver = `bullmq`, ShouldQueue listener):**

```
HTTP request → controller → dispatcher.dispatch(new UserRegistered(id))
  → loop listeners → finds LogUserRegistrationListener (ShouldQueue)
  → resolves queueToken → queue.push(new ListenerJob({
        listenerTokenKey: 'log-user-registration',
        eventConstructorName: 'UserRegistered',
        eventArgs: [id],
    }))
  → bullmq enqueues to Redis
  → HTTP response returns (does not wait for the listener)

[Separate process: pnpm queue:work]
  → BullMQ Worker pops job
  → worker callback: registry.rehydrateJob(job.data) → ListenerJob instance
  → ListenerJob.handle(container, registry):
        listener = container.make(Token(payload.listenerTokenKey))
        EventCtor = registry.getEvent(payload.eventConstructorName)
        event = new EventCtor(...payload.eventArgs)
        await listener.handle(event)
  → retry / fail handled by BullMQ per ListenerJob statics (tries=3)
```

**Runtime flow (driver = `memory`):** Same shape; `InMemoryQueue` drains via `queueMicrotask` in the same process. Behaviorally identical to F3's current `ShouldQueue` path — F3 tests remain green.

**Runtime flow (no `queueToken` registered):** Dispatcher's existing `queueMicrotask` fallback executes. F3 backward compatibility preserved.

## 5. Components

### 5.1 `Job.ts`

```ts
export abstract class Job {
  static readonly tries: number = 1
  static readonly delay: number = 0
  static readonly queue: string = 'default'
  static readonly backoff: number = 0

  abstract handle(...args: unknown[]): void | Promise<void>

  abstract serialize(): { name: string, args: readonly unknown[] }
}
```

`handle()` signature is intentionally open (`...args: unknown[]`) so subclasses (like `ListenerJob`) can accept `(container, registry)`. Standard user Jobs override `handle()` with zero args. The Worker provides the right args based on Job type.

> Note: this is a design compromise — a stricter API would split `Job` and `ContextAwareJob`. For MVP YAGNI, one class with permissive handle is acceptable.

### 5.2 `Queue.ts`

```ts
import type { Job } from './Job'

export interface PushOptions {
  tries?: number
  delay?: number
  queue?: string
  backoff?: number
}

export interface JobHandle {
  id: string
  queue: string
}

export interface Queue {
  push(job: Job, options?: PushOptions): Promise<JobHandle>
  later(delayMs: number, job: Job, options?: PushOptions): Promise<JobHandle>
  size(queueName?: string): Promise<number>
  clear(queueName?: string): Promise<void>
}
```

### 5.3 `JobRegistry.ts`

```ts
import type { Job } from './Job'

export type JobConstructor = new (...args: never[]) => Job
export type EventConstructor = new (...args: never[]) => object

export interface JobRegistry {
  registerJob(name: string, ctor: JobConstructor): void
  registerEvent(name: string, ctor: EventConstructor): void
  rehydrateJob(payload: { name: string, args: readonly unknown[] }): Job
  getEvent(name: string): EventConstructor
}
```

### 5.4 `InMemoryJobRegistry.ts`

Implements `JobRegistry` with two `Map<string, ctor>` (one for jobs, one for events). `rehydrateJob` constructs `new JobCtor(...args)`. `getEvent` returns the ctor. Unregistered name → throws `JobNotRegisteredError` / `EventNotRegisteredError`.

### 5.5 `InMemoryQueue.ts`

State:
- `#pending: Map<string /* queueName */, Array<{job, options, attemptsLeft, jobHandle}>>`
- `#nextId: number` (monotonic for JobHandle.id)
- `#scheduled: Set<NodeJS.Timeout>` (delayed jobs)

`push`:
1. Compute `queueName = options.queue ?? jobCtor.queue` (`'default'` fallback).
2. Compute `tries = options.tries ?? jobCtor.tries` (`1` fallback).
3. Compute `delay = options.delay ?? jobCtor.delay` (`0` fallback).
4. If `delay > 0`: `setTimeout(() => this.#enqueueAndDrain(...), delay)`.
5. Else: `this.#enqueueAndDrain(...)`.
6. Return `{ id, queue: queueName }`.

`#enqueueAndDrain` pushes to `#pending[queueName]` and schedules `Promise.resolve().then(() => this.#drainOnce(queueName))`.

`#drainOnce`:
- Iterates the queue's pending list.
- For each: `try { await job.handle(/* deps */) } catch (e) { attemptsLeft -= 1; if (attemptsLeft > 0) re-enqueue with backoff delay; else console.error(...) }`.

`later(delay, job, options)` = `push(job, { ...options, delay })`.

`size(queueName?)` returns the pending count (across all queues if no name).

`clear(queueName?)` drops the array(s).

> Open question: should `InMemoryQueue` pass `container` / `registry` to `job.handle()`? For symmetry with the Worker, yes. The plan will specify a `JobContext` parameter passed to `handle` for both drivers.

### 5.6 `BullMQQueue.ts`

Takes `BullMQConnection` (an IORedis client wrapper) in the constructor.

```ts
import { Queue as BullQueue } from 'bullmq'
```

State: `#queues: Map<string, BullQueue>` lazy.

`push`:
1. Resolve queue name and options.
2. `serialize = job.serialize()`.
3. `queue.add(serialize.name, serialize, { attempts: tries, delay, backoff: { type: 'fixed', delay: backoff } })`.
4. Return `{ id: bullJob.id!, queue: queueName }`.

`later` = `push(job, { ...options, delay })`.

`size(queueName?)` → `queue.count()` (sum across if no name).

`clear(queueName?)` → `queue.drain()` + `queue.obliterate({ force: true })`.

Constructor throws `BullMQNotInstalledError` if `bullmq` resolution fails (wrap `import` in try).

### 5.7 `BullMQConnection.ts`

Wraps an IORedis client, accepting `{url}` or `{host, port, password, ...}`. `client` getter returns the IORedis instance. `close()` disconnects.

### 5.8 `ListenerJob.ts`

```ts
import type { Container } from '../core/container/Container'
import type { JobRegistry } from './JobRegistry'
import type { Listener } from '../events/Listener'
import { Job } from './Job'

interface ListenerJobPayload {
  listenerTokenKey: string
  eventConstructorName: string
  eventArgs: readonly unknown[]
}

export class ListenerJob extends Job {
  static readonly tries = 3
  static readonly queue = 'laravelize.listeners'

  constructor(public readonly payload: ListenerJobPayload) {
    super()
  }

  serialize() {
    return { name: 'laravelize.ListenerJob', args: [this.payload] }
  }

  async handle(container: Container, registry: JobRegistry): Promise<void> {
    const listener = container.make<Listener<unknown>>({ key: this.payload.listenerTokenKey } as never)
    const EventCtor = registry.getEvent(this.payload.eventConstructorName)
    const event = new EventCtor(...this.payload.eventArgs)
    await listener.handle(event)
  }
}
```

### 5.9 `QueueWorker.ts`

```ts
import { Worker } from 'bullmq'
import type { Container } from '../core/container/Container'

export class QueueWorker {
  #activeWorkers: Worker[] = []

  constructor(
    private readonly connection: BullMQConnection,
    private readonly registry: JobRegistry,
    private readonly container: Container,
  ) {}

  async work(queueName = 'default', concurrency = 1): Promise<void> {
    const worker = new Worker(
      queueName,
      async (job) => {
        const instance = this.registry.rehydrateJob(job.data)
        await instance.handle(this.container, this.registry)
      },
      { connection: this.connection.client, concurrency },
    )
    worker.on('failed', (job, error) => {
      console.error(`[laravelize.queue] job ${job?.id} failed`, error)
    })
    this.#activeWorkers.push(worker)
  }

  async stop(): Promise<void> {
    await Promise.all(this.#activeWorkers.map(w => w.close()))
    this.#activeWorkers = []
  }
}
```

### 5.10 Tokens (`QueueToken.ts`, `JobRegistryToken.ts`, `QueueWorkerToken.ts`, `BullMQConnectionToken.ts`)

```ts
export const queueToken = createToken<Queue>('laravelize.queue')
export const jobRegistryToken = createToken<JobRegistry>('laravelize.job-registry')
export const queueWorkerToken = createToken<QueueWorker>('laravelize.queue-worker')
export const bullmqConnectionToken = createToken<BullMQConnection>('laravelize.bullmq-connection')
```

### 5.11 Errors (`errors.ts`)

```ts
export class JobNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Job "${name}" is not registered in the JobRegistry.`)
    this.name = 'JobNotRegisteredError'
  }
}

export class EventNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Event "${name}" is not registered in the JobRegistry.`)
    this.name = 'EventNotRegisteredError'
  }
}

export class BullMQNotInstalledError extends Error {
  constructor() {
    super('bullmq driver requires the bullmq + ioredis packages. Install them as peer dependencies.')
    this.name = 'BullMQNotInstalledError'
  }
}
```

### 5.12 CLI `bin/queue-work.ts`

```ts
#!/usr/bin/env node
// Loads the project's QueueProvider, resolves the worker, runs.
// Discovery convention: looks for `laravelize.queue.config.ts` at cwd
// which exports { providers: ServiceProvider[], options?: { driver, redis, ... } }.

async function main() {
  const args = parseArgs(process.argv.slice(2))   // --queue=, --concurrency=
  const config = await loadProjectConfig(process.cwd())
  const container = buildContainer(config.providers)
  const worker = container.make(queueWorkerToken)

  await worker.work(args.queue, args.concurrency)

  const shutdown = async () => {
    await worker.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('[laravelize.queue:work] failed to start', error)
  process.exit(1)
})
```

Convention file `laravelize.queue.config.ts` (user-provided):

```ts
import type { LaravelizeQueueConfig } from '@luckys_luis/nuxt-laravelize/queue'

export default {
  providers: [
    () => import('./server/providers/QueueProvider').then(m => new m.default()),
    () => import('./server/providers/EventsProvider').then(m => new m.default()),
  ],
  options: { driver: 'bullmq', redis: { url: process.env.REDIS_URL! } },
} satisfies LaravelizeQueueConfig
```

> The exact config-loading mechanism is a known design tension. The plan will specify the file convention and a fallback (env var pointing to the config). Out-of-scope variants: workspace globbing, Nuxt template-based config — those would couple the CLI to a full Nuxt boot, which we explicitly avoid.

### 5.13 Module options (`src/module.ts`)

```ts
interface LaravelizeQueueModuleOptions {
  driver?: 'memory' | 'bullmq'              // default 'memory'
  redis?: {
    url?: string
    host?: string
    port?: number
    password?: string
  }
  queues?: readonly string[]                // default ['default']
}

interface ModuleOptions {
  // ... existing
  queue?: LaravelizeQueueModuleOptions
}
```

A default `QueueProvider` is NOT registered automatically — the user creates their own (mirrors the existing `EventsProvider` pattern). The module only exposes types and auto-imports.

### 5.14 Auto-imports server

`src/runtime/server/queue/index.ts`:
```ts
export { Job } from '../../../queue/Job'
export { queueToken } from '../../../queue/QueueToken'
export { jobRegistryToken } from '../../../queue/JobRegistryToken'
export { queueWorkerToken } from '../../../queue/QueueWorkerToken'
export { InMemoryQueue } from '../../../queue/InMemoryQueue'
export { InMemoryJobRegistry } from '../../../queue/InMemoryJobRegistry'
```

`BullMQQueue`, `BullMQConnection`, `QueueWorker` are NOT auto-imported (only needed in the CLI / provider bootstrap; explicit imports keep build output small for HTTP-only Nitro builds).

### 5.15 Dispatcher changes (`src/events/InMemoryDispatcher.ts`)

```ts
// New constructor signature
constructor(private readonly resolver: Resolver) {}

// In dispatch loop, queued branch:
if (isQueued) {
  if (this.resolver.has(queueToken)) {
    const queue = this.resolver.make(queueToken)
    const registry = this.resolver.make(jobRegistryToken)
    registry.registerEvent(ctor.name, ctor)
    void queue.push(new ListenerJob({
      listenerTokenKey: tokenKey,    // need the original token key
      eventConstructorName: ctor.name,
      eventArgs: extractArgs(event),  // see open question below
    }))
    continue
  }
  // F3 fallback: queueMicrotask path
  void Promise.resolve().then(() => {
    queueMicrotask(() => { /* existing try/catch */ })
  })
  continue
}
```

> Open question: `extractArgs(event)` — how do we get the constructor args from the event instance? Two options:
> 1. **Convention:** events must implement `toPayload(): readonly unknown[]`. Mirrors `Job.serialize()`. Documented in the F4 spec.
> 2. **Auto-detect:** clone enumerable own properties as a single object and pass `[obj]`. The event's constructor must accept a single object. Less ergonomic with the current `class UserRegistered { constructor(public readonly userId: string) {} }` pattern.
>
> **Decision:** Option 1. We extend the F3 design: events that need to cross the queue boundary implement `toPayload()`. For backward compat, events without `toPayload()` only work with `driver: 'memory'` in-process; the dispatcher logs a clear error if a BullMQ push is attempted with an event lacking `toPayload()`. **This requires a minor F3 spec amendment**, documented in §10 of this spec.

To track the original token key, the dispatcher needs to store the listener entry with metadata: change `#bound` from `Map<EventConstructor, Token<Listener<unknown>>[]>` to `Map<EventConstructor, Array<{token, tokenKey}>>`. Same for `#anyListeners`.

### 5.16 Module hook

`src/module.ts` adds `addServerImportsDir(resolver.resolve('./runtime/server/queue'))`.

## 6. F3 spec amendment (companion change)

Events that should be queueable across process boundaries must implement:

```ts
toPayload(): readonly unknown[]
```

returning the args to pass to the constructor for rehydration. This is a non-breaking addition to F3 — events without it still work for in-memory queues and synchronous listeners. Documented in §10 of this spec, and a follow-up edit to the F3 spec will be made in Task 0 of the plan.

## 7. Errors and edge cases

(See Section 3 of the brainstorm summary; the full matrix is restated here for completeness.)

| Case | Behavior |
| --- | --- |
| `push` without queueToken registered | Dispatcher falls back to F3 queueMicrotask. Direct callers of `queue.push` outside the dispatcher get an unresolvable container error (correct — they must register the queue). |
| Job.serialize returns non-JSON values | BullMQ rejects → JobSerializationError. InMemoryQueue accepts (no JSON round-trip). Docs: payloads must be JSON-safe. |
| `tries: 0` | Treated as `tries: 1`. |
| `delay: 0` | Immediate. |
| `clear()` with jobs in flight | InMemoryQueue: pending dropped, in-flight finish. BullMQQueue: `drain` does not interrupt active jobs. |
| Worker reconnect mid-job | Stalled-job recovery by BullMQ. Document: design jobs idempotent. |
| ListenerJob with unknown listener token | container.make throws → BullMQ marks failed → retry → deadletter after tries. |
| Non-ShouldQueue listener with queueToken registered | Still runs serial in-process. |
| Event registered under two names | Last write wins. Anti-pattern. |
| Event without `toPayload()` enqueued via BullMQ | Dispatcher logs `console.error` and falls back to queueMicrotask (in-process). |

## 8. Testing strategy

Distribution (~80 new tests):

### Unit (~56)
- `test/queue/Job.test.ts` (~4)
- `test/queue/InMemoryJobRegistry.test.ts` (~6)
- `test/queue/InMemoryQueue.test.ts` (~16)
- `test/queue/ListenerJob.test.ts` (~6)
- `test/queue/QueueWorker.test.ts` (~8) — bullmq mocked via `vi.mock`
- `test/queue/BullMQQueue.test.ts` (~10) — bullmq mocked
- `test/events/InMemoryDispatcher.test.ts` (~6 new) — queue integration

### Integration (~6 new in `test/integration/laravelize.test.ts`)
- Probe-based verification of ShouldQueue → queue → handler.
- Explicit Job dispatch via new endpoint.
- Retry behavior end-to-end.
- `later(delay)` timing.

### Playground (no tests; demo code)
- `ProcessVideoJob`, `QueueProvider`, `/api/jobs/process-video`, `/api/jobs-probe`.
- `bin/queue-work.ts` functional with the playground (manual smoke).

## 9. Acceptance criteria

(See Section 4 of the brainstorm summary; restated.)

1. All public surface exported from `src/queue/index.ts` and the module's root.
2. Auto-imports for `Job`, `queueToken`, `jobRegistryToken`, `queueWorkerToken`, `InMemoryQueue`, `InMemoryJobRegistry`.
3. `Job` statics work and are overridable per-push.
4. `InMemoryQueue` push/later/size/clear operative.
5. `BullMQQueue` maps push → BullMQ correctly (verified via mocked bullmq).
6. `QueueWorker.work()` starts BullMQ Worker, rehydrates jobs, executes them.
7. Dispatcher routes ShouldQueue → push when `queueToken` is registered.
8. Dispatcher preserves F3 behavior (queueMicrotask) when `queueToken` is not registered. All 31 unit + 17 integration F3 tests stay green.
9. Job retry works in InMemoryQueue (in-process) and BullMQQueue (BullMQ-native).
10. Errors documented and thrown with the specified shapes.
11. CLI `pnpm queue:work` functional on the playground (manual smoke).
12. ~80 new tests passing. Target total: ~220.
13. Playground has `ProcessVideoJob` + `QueueProvider` working end-to-end.
14. `pnpm lint`, `pnpm typecheck`, `pnpm prepack` clean.
15. `bullmq` + `ioredis` declared as optional peer dependencies in `package.json`.

## 10. Out-of-scope (for a future spec)

- Job middleware, unique jobs, chains, batches.
- BullMQ Flow Producer.
- Dashboard / metrics.
- Cluster helpers.
- Cron / scheduled jobs.
- Encrypted payloads.
- Live config reload.
- Auto-registration / discovery of Job classes.
