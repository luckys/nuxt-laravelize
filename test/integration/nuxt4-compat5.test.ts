import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 compatibilityVersion 5 profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-compat5', import.meta.url)) })
  it('provides the standard runtime services', async () => {
    expect(await $fetch('/api/health')).toEqual({
      authorization: true,
      audit: true,
      container: true,
      dispatcher: true,
      executionContext: true,
      queue: true,
      mailer: true,
      notifications: true,
      broadcasting: true,
      broadcastChannels: true,
      eventBridge: true,
      reliableHandlers: true,
      reliableJobRegistered: true,
      route: { method: 'GET', url: '/api/users/42?preview=1&tags=b&tags=a' },
    })
  })
  it('wires fixture authorization through request-scoped services', async () => {
    const [first, second] = await Promise.all([$fetch<{ requestId: string, sameService: boolean }>('/api/authorization-scope'), $fetch<{ requestId: string, sameService: boolean }>('/api/authorization-scope')])
    expect(first.sameService).toBe(true)
    expect(second.sameService).toBe(true)
    expect(first.requestId).not.toBe(second.requestId)
  })

  it('accepts a valid correlation header only when explicitly trusted', async () => {
    const response = await fetch(url('/api/health'), { headers: { 'x-correlation-id': 'trusted-correlation' } })
    expect(response.headers.get('x-correlation-id')).toBe('trusted-correlation')
    const invalid = await fetch(url('/api/health'), { headers: { 'x-correlation-id': 'invalid correlation' } })
    expect(invalid.headers.get('x-correlation-id')).not.toBe('invalid correlation')
  })
  it('binds handler observability to isolated HTTP server spans', async () => {
    type Result = { serverCarrier: { traceparent: string }, childCarrier: { traceparent: string }, childTraceId: string, childSpanId: string }
    const [first, second] = await Promise.all([$fetch<Result>('/api/observability?delay=10'), $fetch<Result>('/api/observability?delay=1')])
    for (const value of [first, second]) {
      expect(value.serverCarrier.traceparent).toContain(value.childTraceId)
      expect(value.serverCarrier.traceparent).not.toContain(`-${value.childSpanId}-`)
      expect(value.childCarrier.traceparent).toContain(`-${value.childSpanId}-`)
    }
    expect(first.childTraceId).not.toBe(second.childTraceId)
  })

  it('fetches through the Nuxt-native HTTP composable during SSR', async () => {
    expect(await $fetch<string>('/')).toContain('Fetched with useHttp')
  })

  it('translates through nuxt-i18n-micro during SSR', async () => {
    expect(await $fetch<string>('/')).toContain('Translated with $t for Laravelize')
  })

  it('localizes Nitro handlers and propagates the resolved locale into execution context', async () => {
    const value = await $fetch<Record<string, string>>('/api/localization?locale=es')
    expect(value).toMatchObject({ locale: 'es-ES', contextLocale: 'es-ES', greeting: 'Hola, Ada', fallback: 'English fallback', plural: '2 manzanas', number: '1234,50', date: '02/01/2026', eventless: 'Hola, Job' })
  })

  it('uses Accept-Language, falls back on unsupported request locales, and rejects explicit invalid locales', async () => {
    expect(await $fetch<{ locale: string }>('/api/localization', { headers: { 'accept-language': 'es-ES,es;q=0.9' } })).toMatchObject({ locale: 'es-ES' })
    expect(await $fetch<{ locale: string }>('/api/localization?locale=fr')).toMatchObject({ locale: 'en-US' })
    expect(await $fetch<{ locale: string }>('/api/localization?explicit=es-ES')).toMatchObject({ locale: 'es-ES' })
    await expect($fetch('/api/localization?explicit=../es')).rejects.toThrow()
  })

  it('isolates concurrent server-localization requests', async () => {
    const [spanish, english] = await Promise.all([
      $fetch<{ locale: string, greeting: string, contextLocale: string }>('/api/localization?locale=es&delay=20'),
      $fetch<{ locale: string, greeting: string, contextLocale: string }>('/api/localization?locale=en&delay=1'),
    ])
    expect(spanish).toMatchObject({ locale: 'es-ES', contextLocale: 'es-ES', greeting: 'Hola, Ada' })
    expect(english).toMatchObject({ locale: 'en-US', contextLocale: 'en-US', greeting: 'Hello, Ada' })
  })
})
