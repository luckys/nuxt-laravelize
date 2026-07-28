import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/notifications-mail', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/mail': {}, '@nuxt-laravelize/notifications': {} },
  setup(_options, nuxt) { addLaravelizeProvider(nuxt, createResolver(import.meta.url).resolve('./runtime/server/NotificationsMailServiceProvider'), 'server') },
})
