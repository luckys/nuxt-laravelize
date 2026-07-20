import { fileURLToPath } from 'node:url'
import Laravelize from '../../../packages/nuxt/src/module'
import Pennant from '../../../packages/pennant/src/module'
import Routes from '../../../packages/routes/src/module'
import ReliabilityQueue from '../../../packages/reliability-queue/src/module'

export default defineNuxtConfig({
  modules: [Pennant, Routes, ReliabilityQueue, Laravelize],
  alias: {
    '@nuxt-laravelize/routes/runtime': fileURLToPath(new URL('../../../packages/routes/src/public-runtime.ts', import.meta.url)),
    '@nuxt-laravelize/broadcasting/runtime': fileURLToPath(new URL('../../../packages/broadcasting/src/public-runtime.ts', import.meta.url)),
    '@nuxt-laravelize/reliability-queue/runtime': fileURLToPath(new URL('../../../packages/reliability-queue/src/public-runtime.ts', import.meta.url)),
  },
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
  laravelizeBroadcasting: { driver: 'memory', memoryCapacity: 10 },
  laravelizeExecutionContext: { trustIncomingCorrelationHeader: true },
  laravelizeHttp: { baseURL: '/api' },
  laravelizeRoutes: { baseURL: '/api' },
})
