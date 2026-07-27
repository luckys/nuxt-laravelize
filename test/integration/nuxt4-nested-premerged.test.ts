import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 nested-only premerged localization', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-nested-premerged', import.meta.url)) })

  it('keeps page localization and global server localization healthy without an index dictionary', async () => {
    expect(await $fetch<string>('/about')).toContain('Nested premerged translation')
    expect(await $fetch('/api/localization')).toEqual({ healthy: true, translation: 'nested.only' })
  })
})
