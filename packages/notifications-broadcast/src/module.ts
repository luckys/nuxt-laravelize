import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@luckys_luis/nuxt-laravelize-notifications-broadcast', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-broadcasting': {}, '@luckys_luis/nuxt-laravelize-execution-context': {}, '@luckys_luis/nuxt-laravelize-notifications': {} },
  setup(_options, nuxt) { addLaravelizeProvider(nuxt, createResolver(import.meta.url).resolve('./runtime/server/NotificationsBroadcastServiceProvider'), 'server') },
})

export default module
