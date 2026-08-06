# `@nuxt-laravelize/authorization`

[Espanol](./README.es.md) | English

Portable centralized authorization for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/authorization
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/authorization'],
})
```


## Package-specific usage


### Register and evaluate an ability

Register abilities and resource policies once during boot, then resolve the scoped authorizer at the application boundary. The default principal resolver denies until the application supplies a trusted current principal.

```ts
import { authorizationRegistryToken } from '@nuxt-laravelize/authorization/runtime'

const registry = container.make(authorizationRegistryToken)
registry.registerAbility('invoice.view', ({ principal, tenantId }) => {
  return Boolean(principal && tenantId && membershipAllows(principal, tenantId, 'invoice.view'))
})

const authorization = useAuthorization(event)
if (!await authorization.allows('invoice.view')) throw createError({ statusCode: 403 })
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./runtime/server` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Authorization

`@nuxt-laravelize/authorization` is included in the preset. Its core is H3-independent: resolve `authorizationToken` in HTTP, queues, workflows or CLI scopes, and use the auto-imported `useAuthorization(event)` only at the HTTP boundary. Register global abilities and resource policies once through the singleton `authorizationRegistryToken`; resource types are explicit stable keys and duplicate registrations fail immediately.

The scoped authorizer calls the overrideable `principalResolverToken` to reload the current principal. Propagated or serialized execution-context snapshots are metadata, never credentials. For queue contexts, an ordinary principal result is centrally denied and serialized actor/tenant values never reach abilities. Return `trustQueuePrincipal(principal, { actor, tenantId })` only after the application independently authenticates delegation or current worker identity, including the supplied actor and optional tenant. A principal-only wrapper is denied, and trusted values must not be copied from envelope claims without independent verification. The default resolver returns no principal and therefore denies. `inspect` returns a bounded typed decision, while `allows`, `denies`, `authorize`, `any`, and `none` provide convenience behavior. The resource ability name `before` is reserved for the policy hook; the requested action must exist before the hook runs, and `null`/`undefined` means continue. Portable denial and undefined-ability errors contain no H3 dependency; map denials to 403 in HTTP code.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#authorization). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/authorization-queue`](../authorization-queue/README.md), [`@nuxt-laravelize/http`](../http/README.md).
