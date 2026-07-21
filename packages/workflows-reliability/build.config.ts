import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], externals: ['@nuxt-laravelize/database', '@nuxt-laravelize/reliability', '@nuxt-laravelize/workflows'], rollup: { emitCJS: false } })
