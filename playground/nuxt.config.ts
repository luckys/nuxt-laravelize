import type {} from './.nuxt/types/modules.d.ts'
import { defineNuxtConfig } from 'nuxt/config'
import Laravelize from '@nuxt-laravelize/nuxt'

export default defineNuxtConfig({
  modules: [Laravelize],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  i18n: {
    locales: [{ code: 'en', iso: 'en-US', dir: 'ltr' }],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    translationDir: 'locales',
    disablePageLocales: true,
    autoDetectLanguage: false,
    redirects: false,
  },
})
