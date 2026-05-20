import { describe, expect, it } from 'vitest'

import { ProviderCollector } from '../../src/discovery/ProviderCollector'

describe('ProviderCollector', () => {
  it('combines convention, config and api inputs into deduplicated server and client lists', () => {
    const collector = new ProviderCollector()

    collector.addFromConvention({
      server: ['/root/server/providers/A.ts'],
      client: ['/root/app/providers/B.ts'],
    })
    collector.addFromConfig([
      '/root/server/providers/A.ts',
      '/root/extra/SharedProvider.ts',
    ], 'shared')
    collector.addFromConfig(['/root/extra/ServerOnly.ts'], 'server')
    collector.addFromApi('/root/extra/ClientOnly.ts', 'client')

    const result = collector.collect()

    expect(result.server.sort()).toEqual([
      '/root/extra/ServerOnly.ts',
      '/root/extra/SharedProvider.ts',
      '/root/server/providers/A.ts',
    ].sort())

    expect(result.client.sort()).toEqual([
      '/root/app/providers/B.ts',
      '/root/extra/ClientOnly.ts',
      '/root/extra/SharedProvider.ts',
    ].sort())
  })

  it('preserves insertion order within each target list when there are no duplicates', () => {
    const collector = new ProviderCollector()

    collector.addFromConfig(['/root/Z.ts'], 'server')
    collector.addFromConfig(['/root/A.ts'], 'server')

    const result = collector.collect()

    expect(result.server).toEqual(['/root/Z.ts', '/root/A.ts'])
  })

  it('skips duplicate entries silently', () => {
    const collector = new ProviderCollector()

    collector.addFromConfig(['/root/A.ts'], 'server')
    collector.addFromApi('/root/A.ts', 'server')

    const result = collector.collect()

    expect(result.server).toEqual(['/root/A.ts'])
  })
})
