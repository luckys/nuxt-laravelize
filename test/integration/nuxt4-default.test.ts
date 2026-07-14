import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 default profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-default', import.meta.url)) })
  it('boots core transitively', async () => {
    expect(await $fetch('/api/health')).toEqual({ container: true })
  })
})
