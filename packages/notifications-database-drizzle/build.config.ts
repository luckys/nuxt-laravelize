import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/schema', 'src/sqlite-schema', 'src/migrations'], rollup: { emitCJS: false }, externals: ['drizzle-orm', 'drizzle-orm/pg-core', 'drizzle-orm/sqlite-core', '@luckys_luis/nuxt-laravelize-notifications-database/runtime', '@luckys_luis/nuxt-laravelize-migrations'] })
