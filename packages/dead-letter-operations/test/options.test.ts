import { describe, expect, it } from 'vitest'
import { canonicalOrigin, resolveOptions } from '../src/runtime/options'

describe('dead-letter operations options', () => {
  it('is disabled and non-disclosing by default', () => {
    expect(resolveOptions()).toMatchObject({ enabled: false, pageSize: 25, errorSummaries: false, allowedOrigins: [] })
  })
  it('requires exact safe origins when enabled', () => {
    expect(() => resolveOptions({ enabled: true })).toThrow('allowedOrigins is required')
    expect(canonicalOrigin('https://ops.example.com')).toBe('https://ops.example.com')
    expect(canonicalOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    for (const origin of ['*', 'http://example.com', 'https://user@example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com#x']) expect(() => canonicalOrigin(origin)).toThrow()
  })
  it('bounds page size and rejects overlapping or noncanonical paths', () => {
    expect(() => resolveOptions({ pageSize: 101 })).toThrow('pageSize')
    expect(() => resolveOptions({ pagePath: '/ops', apiPath: '/ops/api' })).toThrow('must not overlap')
    expect(() => resolveOptions({ pagePath: '/ops/' })).toThrow('canonical')
  })
})
