import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/execution-context-queue', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/execution-context': {}, '@nuxt-laravelize/queue': {} },
  setup(_options, nuxt) { addLaravelizeProvider(nuxt, createResolver(import.meta.url).resolve('./runtime/server/ExecutionContextQueueServiceProvider'), 'server') },
})
