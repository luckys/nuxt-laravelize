# Migrating to modular packages

The legacy `@luckys_luis/nuxt-laravelize` package remains available during the 0.x transition. New applications should install only the capabilities they use.

## Full preset

```bash
pnpm add @nuxt-laravelize/nuxt
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/nuxt'],
})
```

## Feature-by-feature migration

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue
```

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxt-laravelize/events',
    '@nuxt-laravelize/queue',
  ],
})
```

Do not install or declare `@nuxt-laravelize/core`; feature modules activate it transitively.

| Legacy subpath | New package |
|---|---|
| `@luckys_luis/nuxt-laravelize/core` | `@nuxt-laravelize/core/runtime` |
| `@luckys_luis/nuxt-laravelize/events` | `@nuxt-laravelize/events/runtime` |
| `@luckys_luis/nuxt-laravelize/queue` | `@nuxt-laravelize/queue/runtime` |
| `@luckys_luis/nuxt-laravelize/mail` | `@nuxt-laravelize/mail/runtime` |
| `@luckys_luis/nuxt-laravelize/notifications` | `@nuxt-laravelize/notifications/runtime` |
| `@luckys_luis/nuxt-laravelize/http` | `@nuxt-laravelize/http/runtime` |
| `@luckys_luis/nuxt-laravelize/database` | `@nuxt-laravelize/database/runtime` |

BullMQ is intentionally separate:

```bash
pnpm add @nuxt-laravelize/queue-bullmq
```

Nodemailer adapters are Node-only and must be imported from `@nuxt-laravelize/mail/node`.

The scheduler is not published yet because Nitro 3 integration remains experimental and is not forced into Nuxt 4.
