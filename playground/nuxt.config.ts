import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: ['nuxt-laravelize'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  laravelize: {
    container: true,
  },
})
