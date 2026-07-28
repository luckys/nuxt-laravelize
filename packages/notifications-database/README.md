# @nuxt-laravelize/notifications-database

Opt-in `database` notification channel with bounded JSON records, stable type/version identity, cursor pagination, tenant-fenced read state, and explicit idempotency conflicts.

```bash
pnpm add @nuxt-laravelize/notifications-database @nuxt-laravelize/notifications
```

Add the module after `@nuxt-laravelize/notifications`. Development defaults to a bounded in-memory store; non-development builds fail closed until an application provider binds a durable `DatabaseNotificationStore` to `databaseNotificationStoreToken`.

```ts
class OrderReady extends Notification {
  via() { return ['database'] }
  databaseType() { return 'order.ready' }
  databaseVersion() { return 1 }
  toDatabase() { return { orderId: this.orderId } }
}

const user = {
  routeNotificationFor: channel => channel === 'database'
    ? { type: 'user', id: 'user-1', tenantId: 'tenant-1' }
    : undefined,
}
```

Tenant IDs in routes are accepted only when they match trusted execution context. Payloads must be finite plain JSON objects within structural and byte limits. With an `idempotencyKey`, duplicate content is suppressed; reusing the key for different immutable content throws `DatabaseNotificationIdempotencyConflictError`.

Use `useDatabaseNotifications(event)` or resolve `databaseNotificationStoreToken` to list records and call `markRead()` / `markUnread()`. Every operation requires the full recipient identity and tenant scope; pagination uses `(createdAt, id)` cursors rather than offsets.
