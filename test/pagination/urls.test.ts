import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { buildCursorUrl, buildPageUrl, getRequestPath } from '../../src/pagination/urls'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('getRequestPath', () => {
  it('returns origin + pathname (no query)', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=2'))
    expect(getRequestPath(createMockEvent())).toBe('https://api.example.com/users')
  })
})

describe('buildPageUrl', () => {
  it('appends ?page= and ?per_page= when query is empty', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    expect(buildPageUrl(createMockEvent(), 2, 15))
      .toBe('https://api.example.com/users?page=2&per_page=15')
  })

  it('replaces existing ?page= rather than duplicating', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=1&per_page=10'))
    expect(buildPageUrl(createMockEvent(), 5, 20))
      .toBe('https://api.example.com/users?page=5&per_page=20')
  })

  it('preserves unrelated query params', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?filter=active'))
    expect(buildPageUrl(createMockEvent(), 3, 15))
      .toBe('https://api.example.com/users?filter=active&page=3&per_page=15')
  })
})

describe('buildCursorUrl', () => {
  it('appends ?cursor= and ?per_page= when query is empty', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    expect(buildCursorUrl(createMockEvent(), 'abc123', 15))
      .toBe('https://api.example.com/users?cursor=abc123&per_page=15')
  })

  it('replaces existing ?cursor= and drops ?page=', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=2&cursor=old'))
    expect(buildCursorUrl(createMockEvent(), 'new', 25))
      .toBe('https://api.example.com/users?cursor=new&per_page=25')
  })

  it('preserves unrelated query params', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?filter=active'))
    expect(buildCursorUrl(createMockEvent(), 'xyz', 15))
      .toBe('https://api.example.com/users?filter=active&cursor=xyz&per_page=15')
  })
})
