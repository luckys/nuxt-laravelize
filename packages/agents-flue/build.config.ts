import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], externals: ['@flue/runtime', '@flue/sdk', '@nuxt-laravelize/agent-sdk/runtime'], rollup: { emitCJS: false } })
