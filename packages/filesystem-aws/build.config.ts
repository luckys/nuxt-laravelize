import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index'], rollup: { emitCJS: false }, externals: ['@aws-sdk/client-s3', '@luckys_luis/nuxt-laravelize-filesystem/runtime'] })
