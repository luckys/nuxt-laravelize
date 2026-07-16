# Reliability

Versioned JSON-safe message envelopes, bounded in-memory Outbox/Inbox stores, lease claims, retry/dead states, `OutboxProcessor.runOnce()` and deduplicating `InboxConsumer`.

Delivery is explicitly **at least once**: handlers and webhook receivers must be idempotent. The in-memory store is only for tests/development and is not crash-safe. Use a durable adapter in production.
