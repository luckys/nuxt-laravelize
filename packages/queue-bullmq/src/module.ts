import { defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@nuxt-laravelize/queue-bullmq', configKey: 'laravelizeQueueBullMQ', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/queue': {} },
})

export default module
