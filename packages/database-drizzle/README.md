# @nuxt-laravelize/database-drizzle

Structural Drizzle adapters for `TransactionManager`. They pass the native transaction object as the explicit `UnitOfWork.session` and run registered `afterCommit` hooks sequentially only after Drizzle confirms the commit.

```ts
const transactions = new DrizzleTransactionManager(database)

await transactions.transaction(async (unitOfWork) => {
  await saveWith(unitOfWork.session)
  unitOfWork.afterCommit(() => publishNotification())
})
```

Use `DrizzleTransactionManager` with asynchronous Drizzle drivers. Use `DrizzleSyncTransactionManager` only with synchronous drivers; it rejects Promise-like work from inside the native callback so a commit cannot escape unfinished work.

Post-commit hook failures reject `transaction()` after the database commit; they cannot roll the committed transaction back.
