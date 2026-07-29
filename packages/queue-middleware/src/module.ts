import { defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/queue-middleware', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/cache': {}, '@nuxt-laravelize/queue': {}, '@nuxt-laravelize/rate-limiter': {} },
})
