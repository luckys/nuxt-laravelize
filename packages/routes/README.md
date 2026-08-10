# `@luckys_luis/nuxt-laravelize-routes`

[Espanol](./README.es.md) | English

Wayfinder-inspired typed routes for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-routes
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-routes'],
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
| `./kit` | Public entrypoint for this package. |

## Typed routes

`@luckys_luis/nuxt-laravelize-routes` generates `#laravelize/routes` from explicit declarations and is included in the preset. It infers URL parameters and HTTP methods only; request bodies and responses are intentionally **not inferred**.

```ts
// routes.ts
import { route } from '@luckys_luis/nuxt-laravelize-routes/runtime'

export default {
  users: {
    show: route('GET', '/users/{user}/{section?}'),
    files: route('GET', '/users/{user}/files/{path+}'),
    browse: route('GET', '/files/{path*}'),
  },
} as const
```

The conventional `routes.ts` is loaded automatically. Configure `laravelizeRoutes.declarations` for other explicit files and `baseURL` for a shared prefix. Use `{id}` for required values, `{id?}` for optional values, `{path+}` for a required non-empty catch-all, and `{path*}` for an optional catch-all.

```ts
import routes from '#laravelize/routes'

routes.users.show({ user: 42 }, { query: { preview: true } })
// { method: 'GET', url: '/users/42?preview=1' }
```

Path values are encoded. Catch-all arrays retain segment boundaries, while `.` and `..` segments are rejected to prevent traversal-style URLs. Query keys are sorted, array order is retained, booleans use `1`/`0`, and nullish values are omitted. Package authors can register declarations with `addRoutesDeclaration()` from `@luckys_luis/nuxt-laravelize-routes/kit`.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#typed-routes). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-http`](../http/README.md), [`@luckys_luis/nuxt-laravelize`](../nuxt/README.md).
