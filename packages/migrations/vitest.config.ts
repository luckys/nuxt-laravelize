import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({ resolve: { alias: {
  '@luckys_luis/nuxt-laravelize-console': source('../console/src/index.ts'),
  '@luckys_luis/nuxt-laravelize-core/runtime': source('../core/src/public-runtime.ts'),
  '@luckys_luis/nuxt-laravelize-execution-context/runtime': source('../execution-context/src/public-runtime.ts'),
  '@luckys_luis/nuxt-laravelize-observability/runtime': source('../observability/src/public-runtime.ts'),
} } })
