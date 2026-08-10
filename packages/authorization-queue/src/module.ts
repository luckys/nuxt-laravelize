import { defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@luckys_luis/nuxt-laravelize-authorization-queue', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-authorization': {}, '@luckys_luis/nuxt-laravelize-execution-context-queue': {}, '@luckys_luis/nuxt-laravelize-queue': {} },
})

export default module
