import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: 'node16',
  entries: ['src/index'],
  externals: ['@luckys_luis/nuxt-laravelize-database/runtime', '@luckys_luis/nuxt-laravelize-queue/runtime'],
  rollup: { emitCJS: false },
})
