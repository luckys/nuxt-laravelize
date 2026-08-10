import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({ resolve: { alias: {
  '@luckys_luis/nuxt-laravelize-audit-drizzle/migrations': source('../audit-drizzle/src/migrations.ts'),
  '@luckys_luis/nuxt-laravelize-idempotency-drizzle/migrations': source('../idempotency-drizzle/src/migrations.ts'),
  '@luckys_luis/nuxt-laravelize-migrations/testing': source('../migrations/src/testing.ts'),
  '@luckys_luis/nuxt-laravelize-migrations': source('../migrations/src/index.ts'),
  '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/migrations': source('../notifications-database-drizzle/src/migrations.ts'),
  '@luckys_luis/nuxt-laravelize-reliability-drizzle/migrations': source('../reliability-drizzle/src/migrations.ts'),
  '@luckys_luis/nuxt-laravelize-scout-drizzle/migrations': source('../scout-drizzle/src/migrations.ts'),
  '@luckys_luis/nuxt-laravelize-workflows-drizzle/migrations': source('../workflows-drizzle/src/migrations.ts'),
} } })
