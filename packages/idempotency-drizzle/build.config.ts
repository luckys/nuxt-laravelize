import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/turso', 'src/schema', 'src/sqlite-schema'], externals: ['drizzle-orm', '@nuxt-laravelize/idempotency/runtime'], rollup: { emitCJS: false } })
