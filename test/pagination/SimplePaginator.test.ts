import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { SimplePaginator } from '../../src/pagination/SimplePaginator'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('SimplePaginator', () => {
  it('constructs with items + perPage + currentPage + hasMore', () => {
    const p = new SimplePaginator(['a'], 10, 2, true)
    expect(p.items).toEqual(['a'])
    expect(p.perPage).toBe(10)
    expect(p.currentPage).toBe(2)
    expect(p.hasMore).toBe(true)
  })

  it('toMeta returns Laravel simple shape (no total, no last_page)', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a', 'b'], 5, 3, true)
    expect(p.toMeta(createMockEvent())).toEqual({
      current_page: 3,
      from: 11,
      path: 'https://api.example.com/users',
      per_page: 5,
      to: 12,
    })
  })

  it('toMeta from/to are null when items is empty', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    const p = new SimplePaginator([], 5, 1, false)
    const meta = p.toMeta(createMockEvent())
    expect(meta.from).toBe(null)
    expect(meta.to).toBe(null)
  })

  it('toLinks: prev present when currentPage > 1', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a'], 5, 3, true)
    expect(p.toLinks(createMockEvent()).prev).toBe('https://api.example.com/users?page=2&per_page=5')
  })

  it('toLinks: next present when hasMore is true', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a'], 5, 2, true)
    expect(p.toLinks(createMockEvent()).next).toBe('https://api.example.com/users?page=3&per_page=5')
  })

  it('toLinks: next is null when hasMore is false', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a'], 5, 2, false)
    expect(p.toLinks(createMockEvent()).next).toBe(null)
  })

  it('fromRequest parses ?page and ?per_page', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: '4', per_page: '20' })
    const p = SimplePaginator.fromRequest(createMockEvent(), ['x'], true)
    expect(p.currentPage).toBe(4)
    expect(p.perPage).toBe(20)
    expect(p.hasMore).toBe(true)
  })
})
