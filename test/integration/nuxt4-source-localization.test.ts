import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 source localization profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-source', import.meta.url)) })

  it('loads source payload dictionaries with fallback at runtime', async () => {
    expect(await $fetch('/api/localization')).toEqual({
      locale: 'es-ES',
      contextLocale: 'es-ES',
      greeting: 'Hola, Ada',
      fallback: 'Source fallback',
      plural: '2 elementos',
      regionalFallback: 'Repli français',
      aliasLocale: 'en-US',
      aliasFallback: 'Source fallback',
    })
  })

  it('maps configured query aliases to their dictionary code and canonical context locale', async () => {
    expect(await $fetch('/api/localization?locale=en-US')).toMatchObject({
      locale: 'en-US',
      contextLocale: 'en-US',
      aliasFallback: 'Source fallback',
    })
  })

  it('maps configured Accept-Language aliases and falls back for unsupported values', async () => {
    expect(await $fetch('/api/localization', { headers: { 'accept-language': 'en-US' } })).toMatchObject({
      locale: 'en-US',
      contextLocale: 'en-US',
    })
    expect(await $fetch('/api/localization?locale=de-DE')).toMatchObject({
      locale: 'es-ES',
      contextLocale: 'es-ES',
      regionalFallback: 'Repli français',
    })
    expect(await $fetch('/api/localization?locale=..%2Fen_US')).toMatchObject({
      locale: 'es-ES',
      contextLocale: 'es-ES',
    })
  })
})
