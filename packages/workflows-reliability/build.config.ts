import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/cli', 'src/bin/workflow-wake-reconcile'], externals: ['@nuxt-laravelize/database', '@nuxt-laravelize/reliability', '@nuxt-laravelize/workflows'], rollup: { emitCJS: false } })
