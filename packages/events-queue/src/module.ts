import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/events-queue', configKey: 'laravelizeEventsQueue', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: {
    '@nuxt-laravelize/core': {},
    '@nuxt-laravelize/events': {},
    '@nuxt-laravelize/queue': {},
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/EventsQueueServiceProvider'), 'server')
  },
})
