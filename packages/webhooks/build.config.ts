import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/testing', 'src/bin/webhook-work'], externals: ['@nuxt-laravelize/reliability'], rollup: { emitCJS: false } })
