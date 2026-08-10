import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  clean: false,
  declaration: 'node16',
  entries: ['src/runtime', 'src/cache-lock', 'src/adapters', 'src/compiler'],
  externals: ['@luckys_luis/nuxt-laravelize-cache', '@luckys_luis/nuxt-laravelize-scheduler'],
  failOnWarn: false,
  rollup: { emitCJS: false },
})
