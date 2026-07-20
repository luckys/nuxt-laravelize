import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/testing', 'src/cli', 'src/bin/outbox-work'], rollup: { emitCJS: false } })
