import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/testing'], externals: ['@nuxt-laravelize/reliability'], rollup: { emitCJS: false } })
