import Laravelize from '../../../packages/nuxt/src/module'
import Pennant from '../../../packages/pennant/src/module'

export default defineNuxtConfig({
  modules: [Pennant, Laravelize],
  future: { compatibilityVersion: 5 },
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
  laravelizeExecutionContext: { trustIncomingCorrelationHeader: true },
  laravelizeHttp: { baseURL: '/api' },
})
