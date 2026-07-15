import { cacheToken, InMemoryCache } from '@nuxt-laravelize/cache/runtime'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { describe, expect, it } from 'vitest'

import { RateLimiter } from '../../src/runtime/RateLimiter'
import RateLimiterServiceProvider from '../../src/runtime/server/RateLimiterServiceProvider'
import { rateLimiterToken } from '../../src/runtime/tokens'

describe('RateLimiterServiceProvider', () => {
  it('registers a singleton backed by the configured cache', () => {
    const container = createContainer()
    container.instance(cacheToken, new InMemoryCache())
    new RateLimiterServiceProvider().register(container)

    expect(container.make(rateLimiterToken)).toBeInstanceOf(RateLimiter)
    expect(container.make(rateLimiterToken)).toBe(container.make(rateLimiterToken))
  })

  it('preserves a custom limiter', () => {
    const container = createContainer()
    const custom = new RateLimiter(new InMemoryCache())
    container.instance(rateLimiterToken, custom)
    new RateLimiterServiceProvider().register(container)

    expect(container.make(rateLimiterToken)).toBe(custom)
  })
})
