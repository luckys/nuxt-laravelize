import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@luckys_luis/nuxt-laravelize-events-queue', configKey: 'laravelizeEventsQueue', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: {
    '@luckys_luis/nuxt-laravelize-core': {},
    '@luckys_luis/nuxt-laravelize-events': {},
    '@luckys_luis/nuxt-laravelize-queue': {},
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/EventsQueueServiceProvider'), 'server')
  },
})

export default module
