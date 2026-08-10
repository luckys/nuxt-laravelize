import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/native'], externals: ['agents', 'agents/client', '@luckys_luis/nuxt-laravelize-agent-sdk/runtime'], rollup: { emitCJS: false } })
