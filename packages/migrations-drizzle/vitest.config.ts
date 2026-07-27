import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({ resolve: { alias: {
  '@nuxt-laravelize/audit-drizzle/migrations': source('../audit-drizzle/src/migrations.ts'),
  '@nuxt-laravelize/idempotency-drizzle/migrations': source('../idempotency-drizzle/src/migrations.ts'),
  '@nuxt-laravelize/migrations/testing': source('../migrations/src/testing.ts'),
  '@nuxt-laravelize/migrations': source('../migrations/src/index.ts'),
  '@nuxt-laravelize/reliability-drizzle/migrations': source('../reliability-drizzle/src/migrations.ts'),
  '@nuxt-laravelize/scout-drizzle/migrations': source('../scout-drizzle/src/migrations.ts'),
  '@nuxt-laravelize/workflows-drizzle/migrations': source('../workflows-drizzle/src/migrations.ts'),
} } })
