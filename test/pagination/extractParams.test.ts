import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { parseCursorParams, parsePageParams } from '../../src/pagination/extractParams'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('parsePageParams', () => {
  it('returns defaults when query is empty (page=1, perPage=15)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 15 })
  })

  it('parses ?page=3', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: '3' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 3, perPage: 15 })
  })

  it('parses ?per_page=25', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '25' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 25 })
  })

  it('clamps per_page to the maxPerPage cap (default 100)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '999' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 100 })
  })

  it('clamps per_page to 1 when 0 or negative', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '0' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 1 })

    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '-5' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 1 })
  })

  it('falls back to page=1 when ?page=abc (non-numeric)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: 'abc' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 15 })
  })

  it('respects options.defaultPerPage', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    expect(parsePageParams(createMockEvent(), { defaultPerPage: 50 })).toEqual({ page: 1, perPage: 50 })
  })

  it('respects options.maxPerPage', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '500' })
    expect(parsePageParams(createMockEvent(), { maxPerPage: 200 })).toEqual({ page: 1, perPage: 200 })
  })
})

describe('parseCursorParams', () => {
  it('returns defaults when query is empty (cursor=null, perPage=15)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    expect(parseCursorParams(createMockEvent())).toEqual({ cursor: null, perPage: 15 })
  })

  it('parses ?cursor=abc123', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ cursor: 'abc123' })
    expect(parseCursorParams(createMockEvent())).toEqual({ cursor: 'abc123', perPage: 15 })
  })

  it('treats empty string cursor as null', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ cursor: '' })
    expect(parseCursorParams(createMockEvent())).toEqual({ cursor: null, perPage: 15 })
  })
})
