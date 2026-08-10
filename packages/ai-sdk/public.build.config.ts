import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ clean: false, declaration: 'node16', failOnWarn: false, entries: ['src/public-runtime', 'src/public-server', 'src/public-testing'], externals: ['ai', 'h3', '@luckys_luis/nuxt-laravelize-core/runtime', '@luckys_luis/nuxt-laravelize-core/runtime/server'], rollup: { emitCJS: false } })
