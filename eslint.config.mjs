// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: true,
  },
  dirs: {
    src: [
      './packages',
      './test',
      './playground',
      './scripts',
    ],
  },
})
  .append(
    // your custom flat config here...
    {
      files: ['packages/events/src/runtime/contracts.ts'],
      rules: {
        '@typescript-eslint/no-invalid-void-type': 'off',
      },
    },
  )
