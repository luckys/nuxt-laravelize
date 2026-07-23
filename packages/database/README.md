# @nuxt-laravelize/database

ORM-neutral factories and ordered seeders. Persistence is supplied by application callbacks rather than a required ORM.

The runtime also exports callback-scoped `TransactionManager<Session>` and `UnitOfWork<Session>` contracts plus the default `transactionManagerToken`. Use `createTransactionManagerToken<Session>(key)` when a container binding should retain its concrete session type. A unit of work exposes its explicit transaction `session`, ordered `afterCommit` registration, and `markRollbackOnly(reason?)`. Transaction managers must throw from the native transaction callback when rollback-only is marked, even if application code catches the initiating failure; they must not run after-commit hooks. An `Error` reason is rethrown, while absent or non-`Error` reasons produce a deterministic rollback-only error. Hook failures reject after commit and therefore cannot roll persistence back.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#database) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#database) guide for factories, states, sequences, registries and seeders.
