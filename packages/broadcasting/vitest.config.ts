import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ resolve: { alias: { '@luckys_luis/nuxt-laravelize-events/runtime': fileURLToPath(new URL('../events/src/public-runtime.ts', import.meta.url)), '@luckys_luis/nuxt-laravelize-core/runtime': fileURLToPath(new URL('../core/src/public-runtime.ts', import.meta.url)) } } })
