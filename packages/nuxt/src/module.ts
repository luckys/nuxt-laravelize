import { createRequire } from 'node:module'
import { defineNuxtModule } from '@nuxt/kit'
import type { ModuleOptions as I18nModuleOptions } from 'nuxt-i18n-micro'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    i18n?: Partial<I18nModuleOptions> | false
  }

  interface NuxtOptions {
    i18n: I18nModuleOptions | false
  }
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    i18n?: Partial<I18nModuleOptions> | false
  }

  interface NuxtOptions {
    i18n: I18nModuleOptions | false
  }
}

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/nuxt', configKey: 'laravelize', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: {
    '@nuxt-laravelize/cache': {},
    '@nuxt-laravelize/core': {},
    '@nuxt-laravelize/database': {},
    '@nuxt-laravelize/events': {},
    '@nuxt-laravelize/encryption': {},
    '@nuxt-laravelize/queue': {},
    '@nuxt-laravelize/rate-limiter': {},
    '@nuxt-laravelize/events-queue': {},
    '@nuxt-laravelize/filesystem': {},
    '@nuxt-laravelize/mail': {},
    '@nuxt-laravelize/http': {},
    '@nuxt-laravelize/hashing': {},
    '@nuxt-laravelize/notifications': {},
    '@nuxt-laravelize/pennant': {},
    '@nuxt-laravelize/scout': {},
    '@nuxt-laravelize/validation': {},
    'nuxt-i18n-micro': {},
  },
  setup(_options, nuxt) {
    const h3Entry = createRequire(import.meta.url).resolve('h3')
    ;(nuxt.hooks as { hook(name: 'nitro:config', callback: (config: { alias?: Record<string, string> }) => void): void }).hook('nitro:config', (nitroConfig) => {
      nitroConfig.alias ??= {}
      nitroConfig.alias.h3 ??= h3Entry
    })
  },
})
