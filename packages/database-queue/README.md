# @nuxt-laravelize/database-queue

Explicit best-effort queue dispatch after a Laravelize database transaction commits.

```ts
import { dispatchAfterCommit } from '@nuxt-laravelize/database-queue'

await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  dispatchAfterCommit(unitOfWork, queue, new SendOrderConfirmation({ orderId: order.id }), {
    deduplication: { id: `tenant.${trustedTenantId}.order.${order.id}.confirmation` },
  })
})
```

`dispatchAfterCommit()` returns `void`, so transaction work cannot deadlock by awaiting a handle that only exists after commit. The transaction promise waits for registered hooks. Rollback suppresses dispatch; a dispatch failure rejects after persistence committed with `AfterCommitQueueDispatchError` and prevents later hooks from running. Multiple dispatches are not an atomic batch: earlier jobs may already be admitted when a later one fails.

This is ordering, not durable delivery. A process crash after commit can lose the job, and transport acknowledgement loss can make admission ambiguous. Do not retry the whole transaction after `AfterCommitQueueDispatchError`; reconcile any partial admission. Its `cause` is server-only diagnostic material and must be redacted before logging or client exposure. Configure bounded queue transport timeouts and cap dispatch count per transaction; timeout is also an ambiguous outcome. Use a transactional outbox whenever losing publication or partial fan-out would make committed state unrecoverable.

Queue options are snapshotted at registration. The job payload and queue metadata contributors are serialized after commit in the originating scope, so keep the job immutable, do not replace execution context before completion, and require custom transaction managers to await hooks before disposing that scope. Build deduplication IDs from trusted server-side tenant scope and domain identity; never trust a complete client-supplied ID. Workers must independently re-authorize tenant and principal access because propagated context is provenance, not authority.
