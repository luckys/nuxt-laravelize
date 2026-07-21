import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ resolve: { alias: { '@nuxt-laravelize/workflows': fileURLToPath(new URL('../workflows/src/index.ts', import.meta.url)) } } })
