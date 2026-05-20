import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { discoverProvidersByConvention } from '../../src/discovery/byConvention'

const fixturesRoot = resolve(__dirname, '__fixtures__')

describe('discoverProvidersByConvention', () => {
  it('finds server providers from server/providers and shared/providers recursively', () => {
    const rootDir = resolve(fixturesRoot, 'withProviders')

    const result = discoverProvidersByConvention(rootDir)

    expect(result.server.sort()).toEqual([
      resolve(rootDir, 'server/providers/DatabaseProvider.ts'),
      resolve(rootDir, 'shared/providers/LoggingProvider.ts'),
    ].sort())
  })

  it('finds client providers from app/providers (recursive) and shared/providers', () => {
    const rootDir = resolve(fixturesRoot, 'withProviders')

    const result = discoverProvidersByConvention(rootDir)

    expect(result.client.sort()).toEqual([
      resolve(rootDir, 'app/providers/AuthProvider.ts'),
      resolve(rootDir, 'app/providers/nested/UiProvider.ts'),
      resolve(rootDir, 'shared/providers/LoggingProvider.ts'),
    ].sort())
  })

  it('returns empty lists when no provider directories exist', () => {
    const rootDir = resolve(fixturesRoot, 'empty')

    const result = discoverProvidersByConvention(rootDir)

    expect(result).toEqual({ server: [], client: [] })
  })
})
