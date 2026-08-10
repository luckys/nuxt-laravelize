import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@luckys_luis/nuxt-laravelize-events',
    configKey: 'laravelizeEvents',
    compatibility: { nuxt: '>=4.3.0 <5' },
  },
  moduleDependencies: {
    '@luckys_luis/nuxt-laravelize-core': {},
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/EventsServiceProvider'), 'server')
    addServerImports([
      { name: 'useDispatcher', from: resolver.resolve('./runtime/server') },
      { name: 'dispatcherToken', from: resolver.resolve('./runtime/server') },
    ])
  },
})

export default module
