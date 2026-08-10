import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], externals: ['@luckys_luis/nuxt-laravelize-database', 'drizzle-orm'], rollup: { emitCJS: false } })
