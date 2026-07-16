import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/turso', 'src/schema', 'src/sqlite-schema'], rollup: { emitCJS: false }, externals: ['drizzle-orm', 'drizzle-orm/pg-core', 'drizzle-orm/sqlite-core', '@nuxt-laravelize/audit/runtime'] })
