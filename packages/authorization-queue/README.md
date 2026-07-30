# @nuxt-laravelize/authorization-queue

Opt-in, fail-closed queue authorization backed by `@nuxt-laravelize/authorization`.

Register an application ability first, then attach the middleware to the shared worker `JobRunner` using trusted worker configuration:

```ts
registry.registerAbility('queue.invoice.process', async ({ principal, tenantId }) => {
  if (!tenantId) return false
  return memberships.currentlyAllows(principal, tenantId, 'invoice.process')
})

runner.use('authorize-invoices', new RequireAuthorization(registry, runner, {
  ability: 'queue.invoice.process',
  jobs: ['billing.invoice.process.v1'],
}).handle, -100)
```

The ability is checked on every process attempt and failed-hook invocation. A normal denial becomes a privacy-bounded terminal `QUEUE_AUTHORIZATION_DENIED` job failure. During processing, resolver, identity-store, and ability-handler exceptions become sanitized retryable `QueueAuthorizationUnavailableError` failures with the original error retained only as a trusted diagnostic cause. Failed hooks are best-effort queue observers, so authorization outages in that phase skip the hook and must be reported through independent terminal observers. Register this middleware with a lower order than rate limiting or exception throttling so denied work never consumes their budgets.

Serialized actor and tenant values are provenance, not credentials. This package never trusts job payload, metadata, tags, queue names, or job names as identity evidence. The application `PrincipalResolver` must independently authenticate a durable delegation or current worker identity, reload current grants and return `trustQueuePrincipal(principal, { actor, tenantId })` with independently verified identity values. Principal-only wrappers are denied. Job-name selection is canonicalized through the worker's job registry and only chooses which trusted worker policy applies; it does not authenticate the job or caller. For jobs carrying resource IDs, configure `resource: { resourceType, resolve }`; the trusted resolver must reload the authoritative resource before the registered policy runs. A coarse global ability does not authorize payload contents, so handlers must still tenant-scope queries and authorize effects not represented by that resource policy.

The ability and each selected job must exist in the same registries used by the worker when `RequireAuthorization` is constructed. Optional `jobs` accepts 1 through 256 unique registered aliases, canonicalizes them and rejects duplicates; omit it to protect every job handled by that runner. Missing queue context, registry mismatch and denied failed hooks fail closed. Keep queue attempts conservative and terminal observers independent of privileged job hooks.

## Authenticated delegation

`installQueueDelegation()` composes final queue admission with worker-side authentication. Install it explicitly with the shared admission contributor registry and `JobRunner`, then keep `RequireAuthorization` for current ability or resource-policy checks:

```ts
installQueueDelegation(admissionContributors, runner, {
  audience: 'billing-workers.production',
  issuers: ['identity.production'],
  jobs: ['billing.invoice.process.v1'],
  issuer,
  verifier,
  authenticator,
})
```

The synchronous issuer receives a frozen `QueueDelegationIssueContext` after the queue, exact serialized alias, registry-canonical job, dispatch ID and payload fingerprint are final. Its producer execution snapshot is context rather than identity proof; the issuer must authenticate the producer through trusted application state or refuse issuance. It returns one opaque printable ASCII credential of at most 8 KiB. The worker strictly parses that metadata, asks the verifier for signed claims, and independently compares the trusted issuer allowlist, audience, actual adapter queue, exact alias, canonical job, dispatch ID, fingerprint, `issuedAtMs` and `expiresAtMs` Unix epoch-millisecond bounds. It then calls the authenticator on every process attempt and failed-hook invocation. The authenticator must reload the durable delegation, current principal, active tenant membership and identity, returning `trustQueuePrincipal()` only when they remain valid. The package verifies that returned actor and tenant match the signed claims and installs a fresh scoped `Authorization`; registered abilities and resource policies still reload and decide current grants and effects.

Missing, malformed, invalid, expired or mismatched credentials and revoked identities fail terminally as the privacy-bounded `QUEUE_DELEGATION_DENIED`. Verifiers return `null` or throw `QueueDelegationDeniedError` for signature, parsing, expiry, unknown-key and other terminal credential failures; authenticators use the same error for revoked durable state. Other verifier and authenticator exceptions become retryable, sanitized `QueueDelegationUnavailableError` values. Missing worker queue/registry configuration fails as `QUEUE_DELEGATION_MISCONFIGURED`, and failed-hook errors remain isolated by queue adapters. Credential strings are sensitive persisted secrets visible to the queue transport, backups and dead-letter tooling: never log, tag or expose them.

This package defines ports and binding checks, not a credential format or cryptographic implementation. It does not include signing keys, KMS integration, key rotation, revocation storage, tenant storage or replay storage. Admission issuance is deliberately synchronous, so remote KMS signing requires a separately designed async admission boundary. Retries and broker redelivery reuse the same authenticated dispatch and must remain valid under at-least-once delivery. Copying a credential to another tuple is rejected, but duplicate effects still require durable idempotency or fencing keyed by the dispatch or business operation.
