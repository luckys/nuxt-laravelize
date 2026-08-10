import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/console', 'src/testing'], externals: ['@luckys_luis/nuxt-laravelize-console'], rollup: { emitCJS: false } })
