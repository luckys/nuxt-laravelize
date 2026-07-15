# @nuxt-laravelize/http

Nuxt-native HTTP client plus Laravel-inspired form requests, middleware, signed URLs, API resources, pagination, gates and policies for Nitro server routes.

## Client requests

Configure an optional base URL:

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/http'],
  laravelizeHttp: {
    baseURL: 'https://api.example.com',
  },
})
```

Use the auto-imported `useHttp` composable exactly like Nuxt's `useFetch`:

```ts
const { data, error, status, refresh } = await useHttp<User>('/users/1')

const { data: createdUser } = await useHttp<User>('/users', {
  method: 'POST',
  body: { name: 'Ada' },
})
```

`useHttp` is created with Nuxt's `createUseFetch`, so it preserves SSR payload transfer, caching, reactive options, request deduplication, interceptors and caller overrides such as `baseURL`.

## Server routes

Server-side requests, middleware, resources, pagination and authorization remain available from `@nuxt-laravelize/http/runtime` and as Nitro auto-imports.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#http) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#http) guide for form requests, handlers, signed URLs, resources, pagination, gates and policies.
