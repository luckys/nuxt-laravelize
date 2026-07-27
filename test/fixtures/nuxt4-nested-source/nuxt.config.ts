import Laravelize from '../../../packages/nuxt/src/module'

export default defineNuxtConfig({
  modules: [Laravelize],
  compatibilityDate: '2026-07-01',
  i18n: {
    locales: [{ code: 'en', iso: 'en-US' }],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    translationDir: 'locales',
    disablePageLocales: false,
    autoDetectLanguage: false,
    redirects: false,
    translationPayloads: { mode: 'source' },
  },
})
