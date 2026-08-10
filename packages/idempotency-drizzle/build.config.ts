import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/turso', 'src/schema', 'src/sqlite-schema', 'src/migrations'], externals: ['drizzle-orm', '@luckys_luis/nuxt-laravelize-idempotency/runtime', '@luckys_luis/nuxt-laravelize-migrations'], rollup: { emitCJS: false } })
