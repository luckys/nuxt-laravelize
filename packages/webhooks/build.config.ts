import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/testing', 'src/bin/webhook-work'], externals: ['@luckys_luis/nuxt-laravelize-reliability'], rollup: { emitCJS: false } })
