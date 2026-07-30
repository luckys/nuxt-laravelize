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
