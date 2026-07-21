# Reliability

Versioned JSON-safe message envelopes, bounded in-memory Outbox/Inbox stores, lease claims, retry/dead states, `OutboxProcessor.runOnce()` and deduplicating `InboxConsumer`.

`OutboxStore.append(envelope, { availableAt })` can defer delivery eligibility without changing the envelope's `occurredAt`. The schedule defaults to `occurredAt` and must be a canonical ISO timestamp. Appending the same ID, envelope, and availability is idempotent; reusing an ID with different content or availability throws `OutboxMessageConflictError`.

Delivery is explicitly **at least once**: handlers and webhook receivers must be idempotent. The in-memory store is only for tests/development and is not crash-safe. Use a durable adapter in production.
