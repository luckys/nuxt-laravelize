import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 without i18n options', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-no-i18n', import.meta.url)) })

  it('keeps ordinary routes healthy without injecting a locale', async () => {
    expect(await $fetch('/api/health')).toEqual({ healthy: true, executionLocale: null })
  })
})
