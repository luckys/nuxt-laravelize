import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], rollup: { emitCJS: false }, externals: ['@luckys_luis/nuxt-laravelize-cache/runtime', 'ioredis'] })
