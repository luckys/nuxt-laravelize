import { describe, expect, it } from 'vitest'

import { renderProvidersModule } from '../src/templates'

describe('renderProvidersModule', () => {
  it('returns an empty providers array when there are no providers', () => {
    const content = renderProvidersModule([])

    expect(content).toBe('export default []\n')
  })

  it('imports each provider as a default export and references it in the array', () => {
    const content = renderProvidersModule([
      '/root/app/providers/AuthProvider.ts',
      '/root/shared/providers/LoggingProvider.ts',
    ])

    expect(content).toBe([
      'import provider0 from \'/root/app/providers/AuthProvider.ts\'',
      'import provider1 from \'/root/shared/providers/LoggingProvider.ts\'',
      '',
      'export default [provider0, provider1]',
      '',
    ].join('\n'))
  })

  it('preserves the full path including .ts extension in import specifiers', () => {
    const content = renderProvidersModule(['/root/app/providers/AuthProvider.ts'])

    expect(content).toContain('import provider0 from \'/root/app/providers/AuthProvider.ts\'')
  })
})
