# @nuxt-laravelize/database-drizzle

Structural Drizzle adapters for `TransactionManager`. They pass the native transaction object as the explicit `UnitOfWork.session` and run registered `afterCommit` hooks sequentially only after Drizzle confirms the commit.

```ts
const transactions = new DrizzleTransactionManager(database)

await transactions.transaction(async (unitOfWork) => {
  await saveWith(unitOfWork.session)
  unitOfWork.afterCommit(() => publishNotification())
})
```

Call `unitOfWork.markRollbackOnly(error)` when a caught inner failure means the transaction must not commit. Both adapters check this inside the native transaction callback, rethrow an `Error` reason when available, and skip all `afterCommit` hooks.

Use `DrizzleTransactionManager` with asynchronous Drizzle drivers. Use `DrizzleSyncTransactionManager` only with synchronous drivers; it rejects Promise-like work from inside the native callback so a commit cannot escape unfinished work.

Post-commit hook failures reject `transaction()` after the database commit; they cannot roll the committed transaction back.
