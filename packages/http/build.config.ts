import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  entries: ['auth', 'http', 'pagination'].map(input => ({
    builder: 'mkdist' as const,
    input: `src/${input}`,
    outDir: `dist/${input}`,
  })),
})
