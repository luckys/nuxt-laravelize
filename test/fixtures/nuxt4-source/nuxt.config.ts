import Laravelize from '../../../packages/nuxt/src/module'

export default defineNuxtConfig({
  modules: [Laravelize],
  compatibilityDate: '2026-07-01',
  i18n: {
    locales: [{ code: 'en_US', iso: 'en-US' }, { code: 'es', iso: 'es-ES', fallbackLocale: 'fr' }, { code: 'fr', iso: 'fr-FR' }],
    defaultLocale: 'es',
    fallbackLocale: 'en_US',
    strategy: 'no_prefix',
    translationDir: 'locales',
    disablePageLocales: true,
    autoDetectLanguage: true,
    redirects: false,
    translationPayloads: { mode: 'source' },
  },
})
