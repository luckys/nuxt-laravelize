import { defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/queue-bullmq', configKey: 'laravelizeQueueBullMQ', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/queue': {} },
})
