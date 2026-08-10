import { defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@luckys_luis/nuxt-laravelize-queue-middleware', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-cache': {}, '@luckys_luis/nuxt-laravelize-queue': {}, '@luckys_luis/nuxt-laravelize-rate-limiter': {} },
})

export default module
