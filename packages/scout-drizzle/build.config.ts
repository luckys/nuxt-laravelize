import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/schema', 'src/sqlite', 'src/sqlite-schema', 'src/turso', 'src/migrations'], rollup: { emitCJS: false }, externals: ['drizzle-orm', 'drizzle-orm/pg-core', 'drizzle-orm/sqlite-core', '@luckys_luis/nuxt-laravelize-scout/runtime', '@luckys_luis/nuxt-laravelize-migrations'] })
