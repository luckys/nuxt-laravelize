import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ clean: false, declaration: 'node16', failOnWarn: false, entries: ['src/public-runtime', 'src/public-server', 'src/public-testing'], externals: ['h3', '@nuxt-laravelize/core/runtime', '@nuxt-laravelize/execution-context/runtime'], rollup: { emitCJS: false } })
