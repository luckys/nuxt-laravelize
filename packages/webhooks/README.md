# Webhooks

Reliable outgoing webhooks backed by `OutboxStore`, plus raw-body verification and an idempotent inbox receiver. Signatures are `HMAC-SHA256(timestamp + "." + deliveryId + "." + exactBody)` and sent as `x-webhook-signature: v1=<hex>`.

This package is **Node-only**: its default transport uses Node's DNS, crypto, buffers and server-side `fetch` APIs.

Outgoing URLs must be HTTPS on port 443 and must not resolve to private, loopback, link-local, multicast or unspecified addresses. Redirects are disabled and requests have a bounded timeout. Secrets are resolved at send time by `secretId` and are never placed in the outbox. `resolveSecret(secretId, context)` receives the trusted envelope tenant, delivery ID, URL, and lease-loss signal; tenant-scoped stores must query by tenant and secret ID together. DNS is checked before each delivery, but validation and connection are not atomically pinned; an allowlisted egress proxy or connection-level address pinning is still required to address DNS rebinding fully. Production construction fails without a durable store. Delivery is at least once.
