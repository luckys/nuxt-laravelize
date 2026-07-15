# @nuxt-laravelize/scout

Portable search contracts, lazy named engines through `ScoutManager`, fluent query builder, and Nuxt `useScout(event)` integration.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/scout'],
  laravelizeScout: { driver: 'memory' },
})
```

Register adapter engines lazily in an application provider. The selected factory runs only when Scout first resolves that driver:

```ts
scout.extend('custom', () => new CustomSearchEngine())
scout.use('custom')

const results = await scout.search('articles', 'supportive care')
  .where('status', 'published')
  .orderBy('published_at', 'desc')
  .paginate(1, 20)
```

The Nuxt provider always registers `memory`. Calling `engine(name?)` returns a cached engine; use `purge(name?)` or `clear()` to discard resolved instances.
