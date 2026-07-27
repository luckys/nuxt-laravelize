import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/turso', 'src/migrations'], externals: ['drizzle-orm', '@nuxt-laravelize/database', '@nuxt-laravelize/reliability', '@nuxt-laravelize/migrations'], rollup: { emitCJS: false } })
