import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 nested-only source localization', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-nested-source', import.meta.url)) })

  it('keeps page localization and global server localization healthy without a root dictionary', async () => {
    expect(await $fetch<string>('/about')).toContain('Nested source translation')
    expect(await $fetch('/api/localization')).toEqual({ healthy: true, translation: 'nested.only' })
  })
})
