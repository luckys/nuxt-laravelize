import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({
  rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  server: true,
  browser: false,
})

describe('nuxt-laravelize integration', () => {
  it('exposes resolved services through the server util on each request', async () => {
    const first = await $fetch<{ counterValue: number, requestId: string }>('/api/laravelize')
    const second = await $fetch<{ counterValue: number, requestId: string }>('/api/laravelize')

    expect(first.counterValue).toBe(1)
    expect(second.counterValue).toBe(2)

    expect(first.requestId).not.toBe(second.requestId)
  })

  it('serves a page that uses the client container without errors', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('data-testid="first-value"')
    expect(html).toContain('data-testid="second-value"')
  })
})
