import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 compatibilityVersion 5 profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-compat5', import.meta.url)) })
  it('provides the standard runtime services', async () => {
    expect(await $fetch('/api/health')).toEqual({
      audit: true,
      container: true,
      dispatcher: true,
      executionContext: true,
      queue: true,
      mailer: true,
      notifications: true,
    })
  })

  it('accepts a valid correlation header only when explicitly trusted', async () => {
    const response = await fetch(url('/api/health'), { headers: { 'x-correlation-id': 'trusted-correlation' } })
    expect(response.headers.get('x-correlation-id')).toBe('trusted-correlation')
    const invalid = await fetch(url('/api/health'), { headers: { 'x-correlation-id': 'invalid correlation' } })
    expect(invalid.headers.get('x-correlation-id')).not.toBe('invalid correlation')
  })

  it('fetches through the Nuxt-native HTTP composable during SSR', async () => {
    expect(await $fetch<string>('/')).toContain('Fetched with useHttp')
  })

  it('translates through nuxt-i18n-micro during SSR', async () => {
    expect(await $fetch<string>('/')).toContain('Translated with $t for Laravelize')
  })
})
