import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({ failOnWarn: false, entries: [{ input: 'bin/', outDir: 'dist/bin' }] })
