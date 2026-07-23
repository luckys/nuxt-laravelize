# `@nuxt-laravelize/dead-letter`

Framework-neutral, source-qualified dead-letter management. The manager validates bounded inputs and opaque cursors, routes to exactly one adapter, and emits optional fail-safe observer events. It **does not authorize** callers.

These APIs are global-operator APIs unless an application independently enforces tenant scope. Applications must enforce `dead-letters.list`, `dead-letters.view`, `dead-letters.view-payload`, `dead-letters.view-error-summary`, `dead-letters.retry`, `dead-letters.discard`, and the stronger `dead-letters.retry-inbox` ability. Never derive authorization from envelope actor or tenant hints. Payload, tenant hints, and error summaries are separately opt-in and may contain sensitive domain data even after best-effort secret redaction. Adapter mutation capabilities default to denied when omitted.

Inbox identity is `(namespace, id)`; retry is at-least-once and may repeat side effects. Durable adapter operation receipts reserve globally unique operation IDs and provide replay evidence, not immutable attempt history. A pending receipt is ambiguous and must never cause a blind re-execution. Observer failure cannot roll back a committed adapter mutation and is intentionally fail-safe. There are no bulk operations. `MemoryDeadLetterOperationStore` is testing-only and provides no durability guarantee.
