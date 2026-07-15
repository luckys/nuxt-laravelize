import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  clean: false,
  declaration: 'node16',
  failOnWarn: false,
  entries: ['src/public-runtime', 'src/public-node', 'src/public-testing'],
  rollup: { emitCJS: false },
})
