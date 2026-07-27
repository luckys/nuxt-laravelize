import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/console', 'src/testing'], externals: ['@nuxt-laravelize/console'], rollup: { emitCJS: false } })
