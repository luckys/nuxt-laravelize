import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { describe, expect, it } from 'vitest'

import { FilesystemManager } from '../../src/runtime/FilesystemManager'
import FilesystemServiceProvider from '../../src/runtime/server/FilesystemServiceProvider'
import { filesystemManagerToken } from '../../src/runtime/tokens'

describe('FilesystemServiceProvider', () => {
  it('registers a default singleton and preserves custom managers', () => {
    const container = createContainer()
    new FilesystemServiceProvider().register(container)
    expect(container.make(filesystemManagerToken)).toBe(container.make(filesystemManagerToken))

    const customContainer = createContainer()
    const custom = new FilesystemManager()
    customContainer.instance(filesystemManagerToken, custom)
    new FilesystemServiceProvider().register(customContainer)
    expect(customContainer.make(filesystemManagerToken)).toBe(custom)
  })
})
