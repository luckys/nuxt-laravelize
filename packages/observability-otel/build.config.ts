import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/public-runtime', 'src/public-server'], rollup: { emitCJS: false }, failOnWarn: false })
