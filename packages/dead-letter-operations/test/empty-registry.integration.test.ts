import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

await setup({ rootDir: fileURLToPath(new URL('./fixtures/empty', import.meta.url)), server: true })

describe('empty adapter registry', () => {
  it('fails every authorized endpoint without dispatching an adapter', async () => {
    const mutation = { method: 'POST', headers: { 'origin': 'http://127.0.0.1:3000', 'content-type': 'application/json', 'x-laravelize-operations': '1', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ revision: '1', operationId: 'operation', reason: 'test', availableAt: '2026-08-01T00:00:00.000Z' }) } as const
    const requests: Array<[string, RequestInit?]> = [
      ['/api/operations/dead-letters/bootstrap'],
      ['/api/operations/dead-letters?source=queue'],
      ['/api/operations/dead-letters/queue/jobs/item'],
      ['/api/operations/dead-letters/queue/jobs/item/payload'],
      ['/api/operations/dead-letters/queue/jobs/item/retry', mutation],
      ['/api/operations/dead-letters/queue/jobs/item/discard', { ...mutation, body: JSON.stringify({ revision: '1', operationId: 'operation', reason: 'test' }) }],
    ]
    for (const [path, options] of requests) {
      const response = await fetch(path, options)
      expect(response.status, path).toBe(503)
      expect(await response.json(), path).toMatchObject({ data: { code: 'no_adapters' } })
      expect(response.headers.get('cache-control'), path).toBe('no-store, private')
    }
  })
})
