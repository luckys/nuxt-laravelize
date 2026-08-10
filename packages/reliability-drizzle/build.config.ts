import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/turso', 'src/migrations'], externals: ['drizzle-orm', '@luckys_luis/nuxt-laravelize-database', '@luckys_luis/nuxt-laravelize-reliability', '@luckys_luis/nuxt-laravelize-migrations'], rollup: { emitCJS: false } })
