import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', entries: ['src/index', 'src/nitro3'], externals: ['nitro', 'nitro/task'], rollup: { emitCJS: false } })
