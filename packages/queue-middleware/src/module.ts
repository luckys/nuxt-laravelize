import { defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@nuxt-laravelize/queue-middleware', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/cache': {}, '@nuxt-laravelize/queue': {}, '@nuxt-laravelize/rate-limiter': {} },
})

export default module
