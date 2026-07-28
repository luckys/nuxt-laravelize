import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/notifications-queue', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/execution-context-queue': {}, '@nuxt-laravelize/notifications': {}, '@nuxt-laravelize/queue': {} },
  setup(_options, nuxt) { addLaravelizeProvider(nuxt, createResolver(import.meta.url).resolve('./runtime/server/NotificationsQueueServiceProvider'), 'server') },
})
