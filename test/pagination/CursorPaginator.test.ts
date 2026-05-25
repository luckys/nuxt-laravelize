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
import { CursorPaginator, decodeCursor, encodeCursor } from '../../src/pagination/CursorPaginator'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('encodeCursor / decodeCursor', () => {
  it('encodes a payload to base64url', () => {
    const encoded = encodeCursor({ key: 'abc', direction: 'next' })
    expect(typeof encoded).toBe('string')
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
  })

  it('decodes the encoded payload round-trip', () => {
    const encoded = encodeCursor({ key: 'user-42', direction: 'next' })
    expect(decodeCursor(encoded)).toEqual({ key: 'user-42', direction: 'next' })
  })

  it('decodeCursor with malformed input throws SyntaxError or similar', () => {
    expect(() => decodeCursor('not-base64-json')).toThrow()
  })
})

describe('CursorPaginator', () => {
  it('constructs with items + perPage + nextCursor + prevCursor', () => {
    const p = new CursorPaginator(['a', 'b'], 10, 'next-c', 'prev-c')
    expect(p.items).toEqual(['a', 'b'])
    expect(p.perPage).toBe(10)
    expect(p.nextCursor).toBe('next-c')
    expect(p.prevCursor).toBe('prev-c')
  })

  it('toMeta includes path, per_page, next_cursor, prev_cursor', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, 'next-c', null)
    expect(p.toMeta(createMockEvent())).toEqual({
      path: 'https://api.example.com/users',
      per_page: 10,
      next_cursor: 'next-c',
      prev_cursor: null,
    })
  })

  it('toLinks includes next/prev URLs when cursors are present', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, 'next-c', 'prev-c')
    expect(p.toLinks(createMockEvent())).toEqual({
      prev: 'https://api.example.com/users?cursor=prev-c&per_page=10',
      next: 'https://api.example.com/users?cursor=next-c&per_page=10',
    })
  })

  it('toLinks: next is null when nextCursor is null', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, null, 'prev-c')
    expect(p.toLinks(createMockEvent()).next).toBe(null)
  })

  it('toLinks: prev is null when prevCursor is null', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, 'next-c', null)
    expect(p.toLinks(createMockEvent()).prev).toBe(null)
  })

  it('fromRequest parses ?cursor and ?per_page', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ cursor: 'incoming', per_page: '20' })
    const p = CursorPaginator.fromRequest(createMockEvent(), ['x'], 'user-99', null)
    expect(p.perPage).toBe(20)
    expect(p.nextCursor).not.toBe(null)
    expect(p.prevCursor).toBe(null)
  })

  it('fromRequest encodes nextCursorKey as base64url when provided', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    const p = CursorPaginator.fromRequest(createMockEvent(), ['x'], 'user-99', null)
    expect(p.nextCursor).not.toBe(null)
    expect(decodeCursor(p.nextCursor!)).toEqual({ key: 'user-99', direction: 'next' })
  })

  it('round-trip: encode key recovers payload via decodeCursor', () => {
    const encoded = encodeCursor({ key: 'user-7', direction: 'next' })
    const decoded = decodeCursor(encoded)
    expect(decoded.key).toBe('user-7')
    expect(decoded.direction).toBe('next')
  })
})
