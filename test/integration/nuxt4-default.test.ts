import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('Nuxt 4 default profile', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/nuxt4-default', import.meta.url)) })
  it('provides the standard runtime services', async () => {
    expect(await $fetch('/api/health')).toEqual({
      authorization: true,
      audit: true,
      container: true,
      cache: true,
      cacheLock: true,
      dispatcher: true,
      encrypter: true,
      executionContext: true,
      features: true,
      filesystem: true,
      hasher: true,
      queue: true,
      mailer: true,
      notifications: true,
      urlSigner: true,
      validator: true,
      rateLimiter: true,
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

  it('emits isolated correlation IDs and ignores untrusted incoming values', async () => {
    const [first, second] = await Promise.all([
      fetch(url('/api/health'), { headers: { 'x-correlation-id': 'untrusted' } }),
      fetch(url('/api/health')),
    ])
    expect(first.headers.get('x-correlation-id')).not.toBe('untrusted')
    expect(first.headers.get('x-correlation-id')).not.toBe(second.headers.get('x-correlation-id'))
  })

  it('automatically propagates HTTP context through a request-scoped queue', async () => {
    const result = await $fetch<{ responseCorrelationId: string, emittedCorrelationId: string }>('/api/queue-context')
    expect(result.emittedCorrelationId).toBe(result.responseCorrelationId)
  })

  it('keeps delayed concurrent requests isolated and does not leak failed requests', async () => {
    const [first, second] = await Promise.all([
      $fetch<{ executionId: string, ambientExecutionId: string | null }>('/api/context?delay=20'),
      $fetch<{ executionId: string, ambientExecutionId: string | null }>('/api/context?delay=1'),
    ])
    expect(first.executionId).not.toBe(second.executionId)
    expect(first.ambientExecutionId).toBeNull()
    expect(second.ambientExecutionId).toBeNull()
    await expect($fetch('/api/context?fail=true')).rejects.toThrow()
    expect((await $fetch<{ ambientExecutionId: string | null }>('/api/context')).ambientExecutionId).toBeNull()
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

  it('encrypts and decrypts authenticated payloads through the provider', async () => {
    const { payload } = await $fetch<{ payload: string }>('/api/encryption')
    expect(payload).not.toContain('secret')
    expect(await $fetch('/api/encryption', { query: { payload } })).toEqual({ value: 'secret' })
    await expect($fetch('/api/encryption', { query: { payload: `${payload}A` } })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('hashes and verifies passwords through the provider', async () => {
    const { hash } = await $fetch<{ hash: string }>('/api/hashing', { method: 'POST', body: { value: 'password' } })
    expect(hash).not.toContain('password')
    expect(await $fetch('/api/hashing', { method: 'POST', body: { value: 'password', hash } })).toEqual({ matches: true })
    expect(await $fetch('/api/hashing', { method: 'POST', body: { value: 'wrong', hash } })).toEqual({ matches: false })
  })

  it('validates through Standard Schema and exposes a nested error bag', async () => {
    expect(await $fetch('/api/validation', { method: 'POST', body: { name: ' Ada ' } })).toEqual({ valid: true, value: { name: 'Ada' } })
    expect(await $fetch('/api/validation', { method: 'POST', body: { name: 'x' } })).toEqual({
      valid: false,
      errors: { 'body.name': ['The name must contain at least three characters.'] },
    })
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
