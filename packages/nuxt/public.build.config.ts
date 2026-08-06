import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  entries: [{ input: 'src/public-server', name: 'public-server' }],
  declaration: true,
  clean: false,
  rollup: { emitCJS: false },
  externals: ['#laravelize/i18n-plural', '#i18n-internal/strategy', '#i18n-internal/payload-source', '#laravelize/i18n-locale-detector', '#laravelize/i18n-source'],
})
