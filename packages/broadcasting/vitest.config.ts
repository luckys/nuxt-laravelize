import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ resolve: { alias: { '@nuxt-laravelize/events/runtime': fileURLToPath(new URL('../events/src/public-runtime.ts', import.meta.url)), '@nuxt-laravelize/core/runtime': fileURLToPath(new URL('../core/src/public-runtime.ts', import.meta.url)) } } })
