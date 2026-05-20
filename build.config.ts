import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    {
      builder: 'mkdist',
      input: 'src/core/',
      outDir: 'dist/core',
    },
  ],
})
