import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ resolve: { alias: { '@nuxt-laravelize/broadcasting/runtime': fileURLToPath(new URL('../broadcasting/src/runtime/Broadcasting.ts', import.meta.url)) } } })
