import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/cli', 'src/bin/workflow-wake-reconcile'], externals: ['@luckys_luis/nuxt-laravelize-database', '@luckys_luis/nuxt-laravelize-reliability', '@luckys_luis/nuxt-laravelize-workflows'], rollup: { emitCJS: false } })
