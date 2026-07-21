import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], externals: ['@nuxt-laravelize/database', 'drizzle-orm'], rollup: { emitCJS: false } })
