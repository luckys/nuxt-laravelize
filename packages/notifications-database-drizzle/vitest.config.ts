import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ resolve: { alias: {
  '@luckys_luis/nuxt-laravelize-notifications-database/runtime': fileURLToPath(new URL('../notifications-database/src/runtime/index.ts', import.meta.url)),
} } })
