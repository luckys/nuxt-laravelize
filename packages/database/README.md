# `@luckys_luis/nuxt-laravelize-database`

[Espanol](./README.es.md) | English

ORM-neutral factories and seeders for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-database
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-database'],
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

## Database

`@luckys_luis/nuxt-laravelize-database` provides ORM-neutral factories, seeders, and explicit transaction/unit-of-work contracts. Your application supplies persistence callbacks or adapters; relationships are composed explicitly without ORM metadata.

```bash
pnpm add @luckys_luis/nuxt-laravelize-database
```

```ts
import { Factory, builtInFaker, recycle } from '@luckys_luis/nuxt-laravelize-database/runtime'

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
import { DefaultSeederRegistry, Seeder } from '@luckys_luis/nuxt-laravelize-database/runtime'

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
import { DrizzleTransactionManager } from '@luckys_luis/nuxt-laravelize-database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  await outbox.appendIn(unitOfWork, envelope)
  unitOfWork.afterCommit(() => metrics.increment('orders.created'))
})
```

Repositories receive `unitOfWork.session` explicitly, so domain writes and outbox records can share the physical transaction. Call `unitOfWork.markRollbackOnly(error)` when a caught inner failure must still abort the transaction. Transaction managers throw before native commit and skip `afterCommit` hooks whenever rollback-only is marked; custom implementations must provide the same guarantee. `afterCommit` hooks otherwise run only after a confirmed commit, and a hook failure cannot roll the commit back. Use `DrizzleSyncTransactionManager` for synchronous SQLite drivers: it deliberately rejects Promise-returning work instead of allowing async work to escape the native transaction.

### Best-effort queue dispatch after commit

`@luckys_luis/nuxt-laravelize-database-queue` joins the explicit unit-of-work and queue contracts without adding ambient transaction discovery.

```bash
pnpm add @luckys_luis/nuxt-laravelize-database @luckys_luis/nuxt-laravelize-queue @luckys_luis/nuxt-laravelize-database-queue
```

```ts
import { dispatchAfterCommit } from '@luckys_luis/nuxt-laravelize-database-queue'

await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  dispatchAfterCommit(unitOfWork, queue, new SendOrderConfirmation({ orderId: order.id }), {
    deduplication: { id: `tenant.${trustedTenantId}.order.${order.id}.confirmation` },
  })
})
```

`dispatchAfterCommit()` registers synchronously and returns `void`; awaiting a job handle inside transaction work would deadlock because admission starts only after the callback returns and commit succeeds. Rollback and rollback-only suppress the hook. The transaction promise awaits hooks in registration order, and a failed earlier hook can prevent later hooks from running. Multiple dispatches are not an atomic batch: earlier jobs may already be admitted when a later dispatch fails, so reconcile partial admission without retrying the transaction and use an outbox for durable fan-out. Queue options are snapshotted when registered. The retained job and queue metadata contributors are serialized after commit in the originating scope: keep payloads immutable, do not replace execution context before completion, and require custom transaction managers to await hooks before disposing that scope. Build deduplication IDs from trusted server-side tenant scope plus domain identity, never from a complete client-supplied ID. Workers must independently re-authorize because propagated context is provenance, not authority.

This bridge provides ordering, not durable or exactly-once delivery. A process crash after commit can lose publication; a transport may admit the job and then lose its acknowledgement. `AfterCommitQueueDispatchError` therefore means persistence committed and queue admission failed or is ambiguous: do not retry the whole transaction. Its `cause` is server-only diagnostic material and must be redacted before logs or client exposure. Configure bounded queue transport timeouts and cap dispatch cardinality per transaction; timeout is also ambiguous. Deduplication begins at actual admission and cannot close the commit/publication gap. If losing a job would leave committed domain state unrecoverable, append a versioned message to a durable outbox inside the same physical transaction instead.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#database). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-database-drizzle`](../database-drizzle/README.md), [`@luckys_luis/nuxt-laravelize-database-queue`](../database-queue/README.md), [`@luckys_luis/nuxt-laravelize-migrations`](../migrations/README.md).
