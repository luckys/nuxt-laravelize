# `@luckys_luis/nuxt-laravelize-pennant`

[Espanol](./README.es.md) | English

Scoped feature flags for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-pennant
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-pennant'],
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

## Feature flags

`@luckys_luis/nuxt-laravelize-pennant` provides scoped, lazy feature flags with boolean or rich values. The preset registers an in-memory store; replace `featureManagerToken` with a manager backed by a shared `FeatureStore` in distributed deployments.

```ts
const features = useFeatures(event)
features.define('new-checkout', scope => scope.plan === 'pro' ? 'variant-b' : false)
const accountFeatures = features.for({ plan: 'pro', toFeatureIdentifier: () => 'account:42' })
if (await accountFeatures.active('new-checkout')) return { variant: await accountFeatures.value('new-checkout') }
```

Definitions are evaluated only after a store miss and their result is persisted. Use `activate()`, `deactivate()` and `forget()` for one scope, `purge()` for stored rollout data, and `flushCache()` at explicit lifecycle boundaries. Object scopes must implement `toFeatureIdentifier()` to prevent unstable identity from object serialization.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#feature-flags). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-cache`](../cache/README.md), [`@luckys_luis/nuxt-laravelize-core`](../core/README.md).
