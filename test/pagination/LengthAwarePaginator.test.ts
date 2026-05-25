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
import { LengthAwarePaginator } from '../../src/pagination/LengthAwarePaginator'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('LengthAwarePaginator', () => {
  it('constructs with items + total + perPage + currentPage', () => {
    const p = new LengthAwarePaginator(['a', 'b', 'c'], 25, 5, 2)
    expect(p.items).toEqual(['a', 'b', 'c'])
    expect(p.total).toBe(25)
    expect(p.perPage).toBe(5)
    expect(p.currentPage).toBe(2)
  })

  it('lastPage is ceil(total / perPage)', () => {
    expect(new LengthAwarePaginator([], 25, 5, 1).lastPage).toBe(5)
    expect(new LengthAwarePaginator([], 27, 5, 1).lastPage).toBe(6)
  })

  it('lastPage is at least 1 even when total is 0', () => {
    expect(new LengthAwarePaginator([], 0, 5, 1).lastPage).toBe(1)
  })

  it('from is (currentPage - 1) * perPage + 1', () => {
    expect(new LengthAwarePaginator(['x', 'y'], 25, 5, 3).from).toBe(11)
  })

  it('to is base + items.length', () => {
    expect(new LengthAwarePaginator(['x', 'y'], 25, 5, 3).to).toBe(12)
  })

  it('from and to are null when items is empty', () => {
    const p = new LengthAwarePaginator([], 25, 5, 1)
    expect(p.from).toBe(null)
    expect(p.to).toBe(null)
  })

  it('clamps perPage and currentPage to at least 1', () => {
    const p = new LengthAwarePaginator([], 25, 0, 0)
    expect(p.perPage).toBe(1)
    expect(p.currentPage).toBe(1)
  })

  it('toMeta returns Laravel-shape (current_page, from, last_page, path, per_page, to, total)', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=2'))
    const p = new LengthAwarePaginator(['x', 'y', 'z'], 25, 5, 2)
    expect(p.toMeta(createMockEvent())).toEqual({
      current_page: 2,
      from: 6,
      last_page: 5,
      path: 'https://api.example.com/users',
      per_page: 5,
      to: 8,
      total: 25,
    })
  })

  it('toLinks returns first/last/prev/next URLs with correct page numbers', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new LengthAwarePaginator(['x'], 25, 5, 3)
    expect(p.toLinks(createMockEvent())).toEqual({
      first: 'https://api.example.com/users?page=1&per_page=5',
      last: 'https://api.example.com/users?page=5&per_page=5',
      prev: 'https://api.example.com/users?page=2&per_page=5',
      next: 'https://api.example.com/users?page=4&per_page=5',
    })
  })

  it('prev is null when currentPage is 1', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new LengthAwarePaginator(['x'], 25, 5, 1)
    expect(p.toLinks(createMockEvent()).prev).toBe(null)
  })

  it('next is null when currentPage equals lastPage', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new LengthAwarePaginator(['x'], 25, 5, 5)
    expect(p.toLinks(createMockEvent()).next).toBe(null)
  })

  it('fromRequest parses ?page and ?per_page from the event', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: '3', per_page: '10' })
    const p = LengthAwarePaginator.fromRequest(createMockEvent(), ['x', 'y'], 25)
    expect(p.currentPage).toBe(3)
    expect(p.perPage).toBe(10)
    expect(p.items).toEqual(['x', 'y'])
    expect(p.total).toBe(25)
  })
})
