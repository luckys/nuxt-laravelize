import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/sources', 'src/testing'], externals: ['@nuxt-laravelize/migrations', '@nuxt-laravelize/audit-drizzle/migrations', '@nuxt-laravelize/idempotency-drizzle/migrations', '@nuxt-laravelize/notifications-database-drizzle/migrations', '@nuxt-laravelize/reliability-drizzle/migrations', '@nuxt-laravelize/scout-drizzle/migrations', '@nuxt-laravelize/workflows-drizzle/migrations'], rollup: { emitCJS: false } })
