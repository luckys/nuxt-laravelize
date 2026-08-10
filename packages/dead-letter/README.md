# `@luckys_luis/nuxt-laravelize-dead-letter`

[Espanol](./README.es.md) | English

Framework-neutral dead-letter management contracts and registry

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-dead-letter
```

## Package-specific usage


### Manage failed messages through an explicit adapter

Register exactly one dead-letter adapter and authorize every operation at the application boundary. Payloads and error summaries are separate sensitive capabilities; an envelope actor or tenant hint is never an authorization credential.

```ts
import { DeadLetterManager } from '@luckys_luis/nuxt-laravelize-dead-letter'

const manager = new DeadLetterManager(adapter, { observer })
const page = await manager.list({ source: 'orders', limit: 25 })
const item = await manager.get({ source: 'orders', id: page.data[0].id })
await manager.retry(item.key, { operationId: crypto.randomUUID() })
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Reliability and webhooks

`@luckys_luis/nuxt-laravelize-reliability` provides versioned JSON-safe envelopes, leased outbox processing, and inbox deduplication. The preset includes `@luckys_luis/nuxt-laravelize-reliability-queue` so reliable handlers and `ReliableMessageJob` are registered, but deliberately binds no volatile production store. Every production application must bind durable, shared Inbox and Outbox stores; `reliability-drizzle` is optional. Webhooks remain a framework-neutral opt-in. Delivery is **at least once**: retries, lease expiry, worker crashes, and acknowledgement ambiguity (the effect committed but its acknowledgement was lost) can all repeat a message, so every handler and webhook receiver must be idempotent.

Dead-letter management is opt-in through `@luckys_luis/nuxt-laravelize-dead-letter`; the preset installs no administrative adapter. Applications must authorize list/view/payload/error-summary/retry/discard and the stronger inbox-retry ability. Payload, error summaries, and tenant hints are opt-in and envelope identity is never authorization. Adapter capabilities fail closed when omitted. Reliability supports retry scheduling and discard; BullMQ supports immediate retry only. Inbox retry can repeat side effects. Reliability receipts are bounded operation idempotency/audit metadata, not full attempt history. Active dead evidence is retained by default. BullMQ fencing is optimistic; its adapter lists bounded snapshots of at most 1000 retained failed jobs and rejects larger sources, which require a narrower queue or retention policy. No bulk actions are provided.

Install `@luckys_luis/nuxt-laravelize-dead-letter-operations` separately for the optional operations dashboard. It is disabled by default and absent from the preset. Enabling it requires at least one exact canonical `allowedOrigins` value; configure literal nonoverlapping `pagePath` and `apiPath`, register adapters from an application provider, and define the dead-letter abilities centrally. The fixed API independently authorizes every endpoint, exposes payload only through its dedicated endpoint, never exposes tenant hints, requires revision-fenced CSRF-guarded JSON mutations, and returns 503 when no adapter exists. See the package README for configuration.

```bash
pnpm add @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-webhooks
# Optional durable Drizzle adapter:
pnpm add @luckys_luis/nuxt-laravelize-reliability-drizzle drizzle-orm
```

The envelope execution-context snapshot is correlation provenance only. It **MUST NOT** authorize a tenant, actor, role, or resource. Re-authenticate and re-authorize against trusted current application state inside the consumer.

```ts
import { createEnvelope } from '@luckys_luis/nuxt-laravelize-reliability'
import { DrizzlePostgresReliabilityStore } from '@luckys_luis/nuxt-laravelize-reliability-drizzle/postgres'

const store = new DrizzlePostgresReliabilityStore(db)
const envelope = createEnvelope({
  type: 'invoice.paid.v1',
  payload: { invoiceId: 'inv_1' },
})

await db.transaction(async (tx) => {
  await markInvoicePaid(tx, 'inv_1')
  await store.appendWith(tx, envelope, {
    availableAt: new Date(Date.now() + 60_000).toISOString(),
  })
})
```

`availableAt` is the earliest claim time and defaults to the envelope's `occurredAt`; scheduling never changes when the event occurred. Both values require canonical ISO timestamps. Repeating an append with the same ID, normalized envelope, and availability is idempotent. Reusing an ID with different content or availability throws `OutboxMessageConflictError` instead of silently discarding a message.

The business write and `appendWith(tx, envelope, options)` **must use the same database transaction and connection**. Appending before or after that transaction reintroduces the dual-write gap and can lose an event or publish one for rolled-back state. Apply the supplied base migration followed by the dialect-specific append-availability migration. The immutable schedule remains stable while mutable delivery availability advances during retries. The in-memory `/testing` store is bounded, volatile, and only for tests/development; production requires a durable shared store, stable worker owner IDs, bounded leases/retries, heartbeat/lease renewal for work that may outlive its lease, dead-message monitoring, and retention/reconciliation operations. Drizzle remains optional and is installed only when this adapter is selected.

Apply the dialect terminal-time migration (`0004` PostgreSQL or `0005` SQLite/Turso), then run bounded retention passes with `store.prune({ namespace: 'outbox', completedBefore, states: ['delivered'], types: ['laravelize.workflow.wake.v1'], limit: 500 })`. Retention uses authoritative `terminal_at`, never envelope or eligibility time; legacy terminal rows remain null until an operator explicitly backfills them. Dead rows require explicit selection and should normally be retained for incident evidence. Pruning shortens durable ID deduplication, so keep rows beyond clock skew and the maximum replay window.

Run outbox delivery as a supervised process. Its config module exports an `OutboxWorker`; SIGINT/SIGTERM stop intake, drain in-flight work, then close resources. Use `--once` for one operational pass (including scheduler invocation), never `run()` from a scheduler because overlapping long-lived workers break ownership assumptions.

```bash
pnpm exec outbox-work --config ./outbox-worker.config.js
pnpm exec outbox-work --once --config ./outbox-worker.config.js
pnpm exec webhook-work --config ./webhook-worker.config.js
```

`@luckys_luis/nuxt-laravelize-webhooks` supplies `OutgoingWebhookProcessor`, raw-body HMAC verification, and `WebhookInboxReceiver`. Its transport is **Node-only** because it uses Node DNS, crypto, buffers, and server-side fetch. Resolve signing secrets at delivery time; only `secretId` belongs in an outbox payload. Production constructors require durable outbox/inbox stores.

```ts
import { OutgoingWebhookProcessor, createWebhookEnvelope } from '@luckys_luis/nuxt-laravelize-webhooks'

await store.append(createWebhookEnvelope({
  url: 'https://hooks.example.com/orders',
  secretId: 'customer-42-current',
  body: { orderId: 'order_1' },
}))

const webhooks = new OutgoingWebhookProcessor(store, {
  owner: 'webhooks-worker-1',
  resolveSecret: secrets.resolve,
  production: true,
})
await webhooks.runOnce()
```

Outgoing URLs require HTTPS port 443, reject credentials and private/reserved addresses, disable redirects, and use bounded timeouts. Custom transports must preserve those redirect, timeout, DNS/IP, and TLS restrictions. SSRF risk is reduced, not eliminated: DNS validation and the later connection are not atomically pinned, leaving a DNS-rebinding/TOCTOU residual. For untrusted destinations, enforce an allowlisted egress proxy or connection-level address pinning plus network egress policy. Verify incoming signatures against the exact raw bytes, enforce timestamp tolerance, authenticate/authorize endpoint ownership separately, and retain inbox deduplication records for at least the sender's retry window.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#reliability-and-webhooks). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-reliability`](../reliability/README.md), [`@luckys_luis/nuxt-laravelize-dead-letter-operations`](../dead-letter-operations/README.md), [`@luckys_luis/nuxt-laravelize-queue-bullmq`](../queue-bullmq/README.md).
