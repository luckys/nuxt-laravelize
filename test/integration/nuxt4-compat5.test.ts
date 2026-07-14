import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 compatibilityVersion 5 profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-compat5', import.meta.url)) })
  it('boots core transitively', async () => {
    expect(await $fetch('/api/health')).toEqual({ container: true })
  })
})
