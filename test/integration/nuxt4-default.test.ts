import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 default profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-default', import.meta.url)) })
  it('provides the standard runtime services', async () => {
    expect(await $fetch('/api/health')).toEqual({
      container: true,
      cache: true,
      cacheLock: true,
      dispatcher: true,
      filesystem: true,
      queue: true,
      mailer: true,
      notifications: true,
      urlSigner: true,
      rateLimiter: true,
    })
  })

  it('fetches through the Nuxt-native HTTP composable during SSR', async () => {
    expect(await $fetch<string>('/')).toContain('Fetched with useHttp')
  })

  it('translates through nuxt-i18n-micro during SSR', async () => {
    expect(await $fetch<string>('/')).toContain('Translated with $t for Laravelize')
  })

  it('generates and validates signed URLs through the HTTP service provider', async () => {
    const { url } = await $fetch<{ url: string }>('/api/signed-url')
    const signed = new URL(url)
    const localUrl = `${signed.pathname}${signed.search}`
    expect(await $fetch(localUrl)).toEqual({ valid: true })

    const tampered = localUrl.replace('download=report', 'download=private')
    await expect($fetch(tampered)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('keeps cache values across request scopes', async () => {
    expect(await $fetch('/api/cache-counter')).toEqual({ value: 1 })
    expect(await $fetch('/api/cache-counter')).toEqual({ value: 2 })
  })

  it('keeps filesystem values across request scopes', async () => {
    expect(await $fetch('/api/filesystem-counter')).toEqual({ value: 1 })
    expect(await $fetch('/api/filesystem-counter')).toEqual({ value: 2 })
  })

  it('protects cache lock ownership across request scopes', async () => {
    expect(await $fetch('/api/cache-lock?owner=owner-a')).toEqual({ acquired: true })
    expect(await $fetch('/api/cache-lock?owner=owner-b')).toEqual({ acquired: false })
    expect(await $fetch('/api/cache-lock?action=release&owner=owner-b')).toEqual({ released: false })
    expect(await $fetch('/api/cache-lock?action=release&owner=owner-a')).toEqual({ released: true })
    expect(await $fetch('/api/cache-lock?owner=owner-b')).toEqual({ acquired: true })
  })

  it('rate limits across request scopes', async () => {
    expect(await $fetch('/api/rate-limit')).toEqual({ allowed: true })
    expect(await $fetch('/api/rate-limit')).toEqual({ allowed: true })
    await expect($fetch('/api/rate-limit')).rejects.toMatchObject({ statusCode: 429 })
  })
})
