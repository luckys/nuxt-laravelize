import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

await setup({ rootDir: fileURLToPath(new URL('./fixtures/enabled', import.meta.url)), server: true })

describe('enabled dead-letter operations module', () => {
  it('registers the page without SSR-disclosing payload data', async () => {
    const html = await $fetch<string>('/operations/dead-letters')
    expect(html).toContain('Dead-letter operations')
    expect(html).toContain('Select an item to inspect metadata and operations.')
    expect(html).not.toContain('<script>alert(')
  })
  it('serves authorized list, detail, payload and capabilities without caching', async () => {
    const response = await fetch('/api/operations/dead-letters/bootstrap')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, private')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toMatchObject({ sources: ['queue'], sourceCapabilities: { queue: { retry: true, discard: true, scheduleRetry: true } }, capabilities: { viewPayload: true, viewErrorSummary: true, retry: true, discard: true, scheduleRetry: true, retryInbox: true } })
    const list = await $fetch<{ items: Array<{ key: { id: string }, payload?: unknown, error?: string }> }>('/api/operations/dead-letters', { query: { source: 'queue' } })
    expect(list.items[0]).toMatchObject({ key: { id: 'fixture' } })
    expect(list.items[0]).not.toHaveProperty('payload')
    expect(list.items[0]?.error).toBe('token=[redacted] failure')
    expect((await fetch('/api/operations/dead-letters?source=hidden')).status).toBe(403)
    const detail = await $fetch<{ payload?: unknown, capabilities: { viewPayload: boolean } }>('/api/operations/dead-letters/queue/jobs/fixture')
    expect(detail).not.toHaveProperty('payload')
    expect(detail.capabilities.viewPayload).toBe(true)
    const payload = await $fetch<{ payload: unknown }>('/api/operations/dead-letters/queue/jobs/fixture/payload')
    expect(payload.payload).toEqual({ html: '<script>alert("secret")</script>' })
  })
  it('enforces mutation request guards and revision fencing on successful actions', async () => {
    const headers = { 'origin': 'http://127.0.0.1:3000', 'content-type': 'application/json', 'x-laravelize-operations': '1', 'sec-fetch-site': 'same-origin' }
    const rejected = await fetch('/api/operations/dead-letters/queue/jobs/discard/discard', { method: 'POST', headers: { ...headers, origin: 'http://evil.example' }, body: JSON.stringify({ revision: '1', operationId: 'denied', reason: 'test' }) })
    expect(rejected.status).toBe(403)
    expect(rejected.headers.get('cache-control')).toBe('no-store, private')
    const stale = await fetch('/api/operations/dead-letters/queue/jobs/discard/discard', { method: 'POST', headers, body: JSON.stringify({ revision: 'stale', operationId: 'stale-operation', reason: 'test' }) })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ data: { code: 'stale_revision' } })
    const discarded = await fetch('/api/operations/dead-letters/queue/jobs/discard/discard', { method: 'POST', headers, body: JSON.stringify({ revision: '1', operationId: 'discard-operation', reason: 'test' }) })
    expect(discarded.status).toBe(200)
    const retried = await fetch('/api/operations/dead-letters/queue/jobs/fixture/retry', { method: 'POST', headers, body: JSON.stringify({ revision: '1', operationId: 'retry-operation', reason: 'test', availableAt: '2026-08-01T00:00:00.000Z' }) })
    expect(retried.status).toBe(200)
  })
})
