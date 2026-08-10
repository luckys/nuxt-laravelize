# `@luckys_luis/nuxt-laravelize`

[Espanol](./README.es.md) | English

Convenience preset for Nuxt Laravelize modules

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
// nuxt.config.ts
import Laravelize from '@luckys_luis/nuxt-laravelize'

export default defineNuxtConfig({
  modules: [Laravelize],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime/server` | Public entrypoint for this package. |

## Nuxt preset

Install `@luckys_luis/nuxt-laravelize` when you want the stable modules, the reliability queue bridge, and `nuxt-i18n-micro` configured together. BullMQ, durable reliability adapters, and the experimental scheduler are intentionally excluded.

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
// nuxt.config.ts
import Laravelize from '@luckys_luis/nuxt-laravelize'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'en', iso: 'en-US', dir: 'ltr' }],
    defaultLocale: 'en',
    translationDir: 'locales',
  },
})
```

Use `$t()` in templates or `useI18n().$t()` in scripts. Set `i18n: false` to disable the integration.

Nitro handlers use the same generated `nuxt-i18n-micro` dictionaries, fallback configuration, and plural function through the server-only API:

```ts
export default defineEventHandler(async (event) => {
  const i18n = await useServerLocalization(event)
  return { message: i18n.t('welcome', { name: 'Ada' }), count: i18n.tc('apples', 2) }
})

import { createServerLocalization } from '@luckys_luis/nuxt-laravelize/runtime/server'
const i18n = await createServerLocalization(context.snapshot().locale ?? 'en')
```

`createServerLocalization()` supports jobs, mail preparation, notifications, CLI, and scheduler code without an H3 event. `ServerLocalization` exposes canonical `locale`, exact configured `localeCode`, `defaultLocale`, `fallbackLocale`, `fallbackLocales`, `availableLocales`, `t`, `tc`, `tn`, `td`, and `tdr`. Request resolution follows configured path/query, locale cookie, `Accept-Language`, and default behavior; configured code, ISO, and language aliases participate in automatic detection. Public locale values and Intl formatting use canonical BCP 47 tags, while dictionaries and custom plural rules use the exact configured code (for example, `en_US` exposes `en-US` but plural receives `en_US`). Explicit and detected locales match only configured aliases and malformed or unsupported values never become asset paths. A selected locale's configured fallback chain runs before global/default fallback, with duplicate and cyclic references bounded; every reference must resolve to an enabled locale. Both `source` and premerged translation payload modes are supported. Missing global/index payloads safely behave as empty dictionaries, so page-only locale layouts remain route-specific. Each localization object is request-local. The public server entry can be imported in plain Node, and `createServerLocalization(locale, source)` accepts an injectable eventless source. Localization APIs and Nitro integration are not registered when i18n is false, missing, or has no usable locales.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#nuxt-preset). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-core`](../core/README.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.md), [`@luckys_luis/nuxt-laravelize-reliability-queue`](../reliability-queue/README.md).
