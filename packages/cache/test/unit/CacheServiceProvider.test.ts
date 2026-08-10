import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { describe, expect, it } from 'vitest'

import CacheServiceProvider from '../../src/runtime/server/CacheServiceProvider'
import { InMemoryCache } from '../../src/runtime/InMemoryCache'
import { cacheToken } from '../../src/runtime/tokens'

describe('CacheServiceProvider', () => {
  it('preserves an application-provided cache adapter', () => {
    const container = createContainer()
    const adapter = new InMemoryCache()
    container.instance(cacheToken, adapter)

    new CacheServiceProvider().register(container)

    expect(container.make(cacheToken)).toBe(adapter)
  })
})
