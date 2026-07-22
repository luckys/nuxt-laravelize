# Reliability

Versioned JSON-safe message envelopes, bounded in-memory Outbox/Inbox stores, lease claims, retry/dead states, `OutboxProcessor.runOnce()` and deduplicating `InboxConsumer`.

`OutboxStore.append(envelope, { availableAt })` can defer delivery eligibility without changing the envelope's `occurredAt`. The schedule defaults to `occurredAt` and must be a canonical ISO timestamp. Appending the same ID, envelope, and availability is idempotent; reusing an ID with different content or availability throws `OutboxMessageConflictError`.

Delivery is explicitly **at least once**: handlers and webhook receivers must be idempotent. The in-memory store is only for tests/development and is not crash-safe. Use a durable adapter in production.

Stores may implement `PrunableReliabilityStore` for bounded retention of terminal rows. Pruning requires an explicit namespace, terminal states, strict `completedBefore` cutoff, and optional message types; it never deletes pending or processing work. Prefer retaining `dead` rows for incident evidence and prune them only through an explicit longer-lived policy. Deleting terminal rows also shortens the durable message-ID deduplication horizon, so retain them beyond clock skew and the maximum replay window.
