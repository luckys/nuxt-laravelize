# @nuxt-laravelize/database

ORM-neutral factories and ordered seeders. Applications supply persistence callbacks or explicit `FactoryPersistenceAdapter` implementations; the package does not require an ORM.

Factories support indexed states and sequences, explicit `for()`/`has()` relationship composers, local `recycle()` pools, deterministic built-in Faker clocks, async lifecycle hooks, and scalar/array cardinality inferred from `count()`. Composition order is definition, states, sequence, `for`, `has`, then call-site overrides.

```ts
import { Factory, builtInFaker, recycle } from '@nuxt-laravelize/database/runtime'

interface UserDraft { name: string, teamId?: string }

class UserFactory extends Factory<UserDraft, number> {
  protected definition(): UserDraft { return { name: this.faker.string.word() } }
}

const teams = recycle([{ id: 'team-a' }, { id: 'team-b' }])
const users = await new UserFactory(builtInFaker({ seed: 42, now: Date.UTC(2025, 0, 1) }))
  .count(2)
  .for(teams, (_user, team) => ({ teamId: team.id }))
  .beforeCreate(validateUser)
  .afterCreate((id) => auditCreatedUser(id))
  .create({ persist: draft => userRepository.insert(draft) })
```

Callback persistence remains supported and returns the generated drafts. All items and hooks run sequentially and fail fast. `make()` never runs async lifecycle hooks. Reused related factories retain their configured count and state; their local indexes restart for every root while their Faker stream advances normally. Recycled collections are frozen defensive copies, cycle by root index, and are never global.

The runtime also exports callback-scoped `TransactionManager<Session>` and `UnitOfWork<Session>` contracts plus the default `transactionManagerToken`. Use `createTransactionManagerToken<Session>(key)` when a container binding should retain its concrete session type. A unit of work exposes its explicit transaction `session`, ordered `afterCommit` registration, and `markRollbackOnly(reason?)`. Transaction managers must throw from the native transaction callback when rollback-only is marked, even if application code catches the initiating failure; they must not run after-commit hooks. An `Error` reason is rethrown, while absent or non-`Error` reasons produce a deterministic rollback-only error. Hook failures reject after commit and therefore cannot roll persistence back.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#database) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#database) guide.
