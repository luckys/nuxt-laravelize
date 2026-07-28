import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], rollup: { emitCJS: false }, externals: ['@nuxt-laravelize/filesystem-aws', 'ioredis'] })
