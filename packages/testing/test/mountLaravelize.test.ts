import { describe, expect, it } from 'vitest'
import { queueToken } from '@nuxt-laravelize/queue/runtime'
import { mountLaravelize } from '../src/index'

describe('mountLaravelize', () => {
  it('mounts the official fakes in a sealed container', () => {
    const mounted = mountLaravelize()
    expect(mounted.container.make(queueToken)).toBe(mounted.queue)
  })
})
