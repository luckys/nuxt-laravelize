import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  entries: [
    'src/kit',
    {
      builder: 'mkdist',
      input: 'src/core',
      outDir: 'dist/core',
    },
    {
      builder: 'mkdist',
      input: 'src/logging',
      outDir: 'dist/logging',
    },
    {
      builder: 'mkdist',
      input: 'src/i18n',
      outDir: 'dist/i18n',
    },
  ],
})
