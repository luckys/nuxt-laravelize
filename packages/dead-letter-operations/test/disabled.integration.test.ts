import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

await setup({ rootDir: fileURLToPath(new URL('./fixtures/disabled', import.meta.url)), server: true })

describe('disabled dead-letter operations module', () => {
  it('registers neither page nor API handler', async () => {
    expect(await (await fetch('/operations/dead-letters')).text()).not.toContain('Dead-letter operations')
    const api = await fetch('/api/operations/dead-letters/bootstrap')
    expect(await api.text()).not.toContain('no_adapters')
    expect(api.headers.get('x-content-type-options')).toBeNull()
  })
})
