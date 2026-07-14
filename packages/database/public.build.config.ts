import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ clean: false, declaration: 'node16', failOnWarn: false, entries: ['src/public-runtime', 'bin/db-seed'], rollup: { emitCJS: false } })
