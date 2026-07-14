import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  entries: [
    'src/kit',
    {
      builder: 'mkdist',
      input: 'src/core/',
      outDir: 'dist/core',
    },
    ...[
      'auth',
      'database',
      'events',
      'http',
      'i18n',
      'logging',
      'mail',
      'nitro',
      'notifications',
      'pagination',
      'queue',
    ].map(input => ({
      builder: 'mkdist' as const,
      input: `src/${input}/`,
      outDir: `dist/${input}`,
    })),
    {
      builder: 'mkdist',
      input: 'bin/',
      outDir: 'dist/bin',
    },
  ],
})
