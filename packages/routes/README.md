# `@nuxt-laravelize/routes`

Wayfinder-inspired, generated typed URL helpers for Nuxt. It infers URL parameters and HTTP methods; it intentionally does **not** infer request bodies or responses.

```ts
// routes.ts
import { route } from '@nuxt-laravelize/routes/runtime'

export default {
  users: {
    show: route('GET', '/users/{user}'),
    files: route('GET', '/users/{user}/files/{path*}'),
  },
} as const
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/routes'],
  laravelizeRoutes: { declarations: ['routes.ts'], baseURL: '/api' },
})
```

```ts
import routes from '#laravelize/routes'

routes.users.show({ user: 42 }) // { url: '/api/users/42', method: 'GET' }
routes.users.show.url({ user: { toRoute: () => 'ada' } }, { query: { preview: true } })
routes.users.show.definition // { path: '/users/{user}', method: 'GET' }
```

Parameters use `{id}`, optional `{id?}`, catch-all optional `{path*}`, or catch-all required `{path+}`. Values are strings, numbers, or objects implementing `toRoute()`. Query keys are sorted; array order is retained; booleans become `1`/`0`; `null` and `undefined` are omitted.

Other modules can contribute declaration paths during setup with `addRoutesDeclaration(nuxt, path)` from `@nuxt-laravelize/routes/kit`. Route declarations are watched in development. Duplicate method/path pairs fail generation with a diagnostic.
