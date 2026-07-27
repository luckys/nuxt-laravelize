import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: 'node16',
  entries: ['src/index', 'src/node', 'src/testing'],
  externals: ['node:process', 'node:readline/promises'],
  rollup: { emitCJS: false },
})
