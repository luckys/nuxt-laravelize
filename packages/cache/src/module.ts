import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@nuxt-laravelize/cache', configKey: 'laravelizeCache', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/CacheServiceProvider'), 'server')
    addServerImports([
      { name: 'useCache', from: resolver.resolve('./runtime/server') },
      { name: 'cacheToken', from: resolver.resolve('./runtime/server') },
      { name: 'useCacheLock', from: resolver.resolve('./runtime/server') },
    ])
  },
})

export default module
