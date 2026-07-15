import { describe, expect, it } from 'vitest'
import { cacheToken } from '@nuxt-laravelize/cache/runtime'
import { queueToken } from '@nuxt-laravelize/queue/runtime'
import { rateLimiterToken } from '@nuxt-laravelize/rate-limiter/runtime'
import { mountLaravelize } from '../src/index'

describe('mountLaravelize', () => {
  it('mounts the official fakes in a sealed container', () => {
    const mounted = mountLaravelize()
    expect(mounted.container.make(cacheToken)).toBe(mounted.cache)
    expect(mounted.container.make(queueToken)).toBe(mounted.queue)
    expect(mounted.container.make(rateLimiterToken)).toBe(mounted.rateLimiter)
  })
})
