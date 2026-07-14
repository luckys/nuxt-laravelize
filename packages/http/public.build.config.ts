import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ clean: false, declaration: 'node16', failOnWarn: false, entries: ['src/public-runtime'], externals: ['h3'], rollup: { emitCJS: false } })
