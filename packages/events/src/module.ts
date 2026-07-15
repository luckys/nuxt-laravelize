import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: {
    name: '@nuxt-laravelize/events',
    configKey: 'laravelizeEvents',
    compatibility: { nuxt: '>=4.3.0 <5' },
  },
  moduleDependencies: {
    '@nuxt-laravelize/core': {},
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
