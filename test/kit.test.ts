import { describe, expect, it } from 'vitest'

import { addLaravelizeProvider, drainLaravelizeProviderQueue } from '../src/kit'

function makeFakeNuxt(): object {
  return {}
}

describe('addLaravelizeProvider / drainLaravelizeProviderQueue', () => {
  it('returns an empty array when no providers have been added', () => {
    const nuxt = makeFakeNuxt()
    const result = drainLaravelizeProviderQueue(nuxt as never)
    expect(result).toEqual([])
  })

  it('drains all pushed entries and clears the queue', () => {
    const nuxt = makeFakeNuxt()
    addLaravelizeProvider(nuxt as never, '/providers/A.ts', 'server')
    addLaravelizeProvider(nuxt as never, '/providers/B.ts', 'client')
    addLaravelizeProvider(nuxt as never, '/providers/C.ts', 'shared')

    const first = drainLaravelizeProviderQueue(nuxt as never)
    expect(first).toEqual([
      { path: '/providers/A.ts', target: 'server' },
      { path: '/providers/B.ts', target: 'client' },
      { path: '/providers/C.ts', target: 'shared' },
    ])

    const second = drainLaravelizeProviderQueue(nuxt as never)
    expect(second).toEqual([])
  })
})
