import Laravelize from '../../../packages/nuxt/src/module'

export default defineNuxtConfig({
  modules: [Laravelize],
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
})
