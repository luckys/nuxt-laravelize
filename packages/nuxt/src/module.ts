import { defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/nuxt', configKey: 'laravelize', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: {
    '@nuxt-laravelize/core': {},
    '@nuxt-laravelize/database': {},
    '@nuxt-laravelize/events': {},
    '@nuxt-laravelize/queue': {},
    '@nuxt-laravelize/events-queue': {},
    '@nuxt-laravelize/mail': {},
    '@nuxt-laravelize/http': {},
    '@nuxt-laravelize/notifications': {},
  },
})
