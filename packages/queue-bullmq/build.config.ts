import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ declaration: 'node16', failOnWarn: false, entries: ['src/cli', { input: 'src/bin/', outDir: 'dist/bin' }] })
