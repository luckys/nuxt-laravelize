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
})
