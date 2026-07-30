import { defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/authorization-queue', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/authorization': {}, '@nuxt-laravelize/execution-context-queue': {}, '@nuxt-laravelize/queue': {} },
})
