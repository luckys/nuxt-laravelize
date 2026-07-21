import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ clean: false, entries: [{ input: 'src/public-runtime', name: 'public-runtime' }], declaration: 'node16', failOnWarn: false })
