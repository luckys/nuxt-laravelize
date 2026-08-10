# `@luckys_luis/nuxt-laravelize-authorization-queue`

[Espanol](./README.es.md) | English

Fail-closed queue authorization bridge for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-authorization-queue
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-authorization-queue'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |

## Queue authorization

`@luckys_luis/nuxt-laravelize-authorization-queue` re-evaluates one registered application ability before selected queue jobs run. Configure selection in trusted worker startup code, not serialized metadata, and register it outside operational middleware with a lower `JobRunner` order. Normal denials become the privacy-bounded terminal code `QUEUE_AUTHORIZATION_DENIED`; resolver, identity-store and ability-handler outages during processing remain retryable failures.

```ts
import { authorizationRegistryToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'
import { RequireAuthorization } from '@luckys_luis/nuxt-laravelize-authorization-queue/runtime'
import { jobRunnerToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'

const registry = container.make(authorizationRegistryToken)
registry.registerAbility('queue.invoice.process', async ({ principal, tenantId }) => {
  if (!tenantId) return false
  return memberships.currentlyAllows(principal, tenantId, 'invoice.process')
})

const runner = container.make(jobRunnerToken)
runner.use('authorize-invoices', new RequireAuthorization(registry, runner, {
  ability: 'queue.invoice.process',
  jobs: ['billing.invoice.process.v1'],
}).handle, -100)
```

The check runs on every attempt, delayed replay and terminal failed-hook invocation; denied failed hooks do not execute under a revoked identity. Processing outages are wrapped in sanitized retryable `QueueAuthorizationUnavailableError` values whose causes are trusted diagnostic material. Failed hooks are best-effort observers and an authorization outage there cannot be retried by current adapters, so use independent terminal reporters. Actor and tenant fields propagated by `execution-context-queue` are provenance only and never enter the ability. Dispatch identity and its unkeyed payload fingerprint are also not credentials. The application `PrincipalResolver` must independently verify a durable delegation or current worker identity, reload current grants and return `trustQueuePrincipal(principal, { actor, tenantId })` with the verified identity binding. Job-name selection is canonicalized through the identical worker registry but provides no identity evidence. For payload resource IDs, configure the optional authoritative `resource` resolver so a registered resource policy receives trusted store data; coarse abilities do not authorize payload contents or unrelated effects. Malformed propagated contexts fail terminally as `INVALID_EXECUTION_CONTEXT`. The package intentionally does not expose `RequirePrincipal` or `RequireTenant` shortcuts without an application-specific authenticated delegation.

For per-dispatch authenticated delegation, call `installQueueDelegation(admissionContributors, runner, options)` before dispatching or processing selected jobs. Its synchronous issuer receives the frozen final admission context plus the current producer execution snapshot and emits one opaque printable ASCII credential up to 8 KiB. That snapshot is context rather than identity proof, so the issuer must authenticate the producer through trusted application state or refuse issuance. On every process attempt and failed hook, the verifier returns signed `QueueDelegationClaimsV1`; the package independently compares the configured issuer allowlist and audience with the actual adapter queue, exact serialized alias, canonical job, dispatch ID, payload fingerprint and Unix epoch-millisecond `issuedAtMs`/`expiresAtMs` bounds. The authenticator must then reload the durable delegation, current principal and active tenant membership and return `trustQueuePrincipal()`. The bridge verifies that actor and tenant match the claims and replaces any previously resolved scoped `Authorization`, while the official `Authorization` provider resolves the scoped principal resolver lazily so already-captured instances also observe the verified identity. `RequireAuthorization` then evaluates current grants and authoritative resources.

Missing, malformed, invalid, expired or mismatched credentials and revoked identities become terminal `QUEUE_DELEGATION_DENIED`; adapters return `null` or throw `QueueDelegationDeniedError` for terminal signature/parsing/key/state failures. Missing trusted worker facts become `QUEUE_DELEGATION_MISCONFIGURED`, while other verifier or authenticator exceptions become sanitized retryable `QueueDelegationUnavailableError` failures. Credential metadata is persisted sensitive material: never log it or expose it through tags, errors or dashboards. The package supplies no JWT/PASETO format, algorithms, keys, KMS, rotation, revocation/membership store or replay store. Synchronous admission does not support remote KMS issuance. Exact redelivery of the same tuple remains valid for retries under at-least-once delivery; copying a credential to another tuple is denied, while duplicate effects still require durable idempotency or fencing.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#queue-authorization). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-authorization`](../authorization/README.md), [`@luckys_luis/nuxt-laravelize-queue`](../queue/README.md), [`@luckys_luis/nuxt-laravelize-execution-context-queue`](../execution-context-queue/README.md).
