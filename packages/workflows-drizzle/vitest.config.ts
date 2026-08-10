import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ resolve: { alias: { '@luckys_luis/nuxt-laravelize-workflows': fileURLToPath(new URL('../workflows/src/index.ts', import.meta.url)) } } })
