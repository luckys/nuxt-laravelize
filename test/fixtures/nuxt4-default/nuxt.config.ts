import { fileURLToPath } from 'node:url'
import Laravelize from '../../../packages/nuxt/src/module'
import Pennant from '../../../packages/pennant/src/module'
import Routes from '../../../packages/routes/src/module'

export default defineNuxtConfig({
  alias: { '@nuxt-laravelize/routes/runtime': fileURLToPath(new URL('../../../packages/routes/src/public-runtime.ts', import.meta.url)) },
  modules: [Pennant, Routes, Laravelize],
  compatibilityDate: '2026-07-01',
  i18n: {
    locales: [{ code: 'en', iso: 'en-US', dir: 'ltr' }],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    translationDir: 'locales',
    disablePageLocales: true,
    autoDetectLanguage: false,
    redirects: false,
  },
  laravelizeEncryption: {
    key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
  laravelizeHashing: {
    iterations: 10_000,
  },
  laravelizeHttp: {
    baseURL: '/api',
    signingKey: 'integration-signing-key-with-32-bytes',
    signingOrigin: 'http://127.0.0.1',
  },
  laravelizeRoutes: { baseURL: '/api' },
})
