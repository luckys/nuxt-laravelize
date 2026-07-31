import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@nuxt-laravelize/rate-limiter', configKey: 'laravelizeRateLimiter', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: {
    '@nuxt-laravelize/cache': {},
    '@nuxt-laravelize/core': {},
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/RateLimiterServiceProvider'), 'server')
    addServerImports([
      'rateLimiterToken',
      'ThrottleRequests',
      'useRateLimiter',
    ].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

export default module
