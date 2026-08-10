import { describe, expect, it } from 'vitest'
import { auditStoreToken } from '@luckys_luis/nuxt-laravelize-audit/runtime'
import { cacheToken } from '@luckys_luis/nuxt-laravelize-cache/runtime'
import { encrypterToken } from '@luckys_luis/nuxt-laravelize-encryption/runtime'
import { filesystemManagerToken } from '@luckys_luis/nuxt-laravelize-filesystem/runtime'
import { hasherToken } from '@luckys_luis/nuxt-laravelize-hashing/runtime'
import { queueToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { rateLimiterToken } from '@luckys_luis/nuxt-laravelize-rate-limiter/runtime'
import { validatorToken } from '@luckys_luis/nuxt-laravelize-validation/runtime'
import { mountLaravelize } from '../src/index'

describe('mountLaravelize', () => {
  it('mounts the official fakes in a sealed container', () => {
    const mounted = mountLaravelize()
    expect(mounted.container.make(auditStoreToken)).toBe(mounted.audit)
    expect(mounted.container.make(cacheToken)).toBe(mounted.cache)
    expect(mounted.container.make(encrypterToken)).toBe(mounted.encrypter)
    expect(mounted.container.make(filesystemManagerToken).disk()).toBe(mounted.filesystem)
    expect(mounted.container.make(hasherToken)).toBe(mounted.hasher)
    expect(mounted.container.make(queueToken)).toBe(mounted.queue)
    expect(mounted.container.make(rateLimiterToken)).toBe(mounted.rateLimiter)
    expect(mounted.container.make(validatorToken)).toBe(mounted.validator)
  })
})
