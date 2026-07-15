import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/schema', 'src/sqlite', 'src/sqlite-schema', 'src/turso'], rollup: { emitCJS: false }, externals: ['drizzle-orm', 'drizzle-orm/pg-core', 'drizzle-orm/sqlite-core', '@nuxt-laravelize/scout/runtime'] })
