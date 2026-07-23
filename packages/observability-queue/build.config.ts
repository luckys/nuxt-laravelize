import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/public-runtime'], rollup: { emitCJS: false }, failOnWarn: false })
