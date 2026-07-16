import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/postgres', 'src/sqlite', 'src/turso'], externals: ['drizzle-orm', '@nuxt-laravelize/reliability'], rollup: { emitCJS: false } })
