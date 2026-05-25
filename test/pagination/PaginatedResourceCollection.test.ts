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
import { Resource } from '../../src/http/resources/Resource'
// eslint-disable-next-line import/first
import { CursorPaginator } from '../../src/pagination/CursorPaginator'
// eslint-disable-next-line import/first
import { LengthAwarePaginator } from '../../src/pagination/LengthAwarePaginator'
// eslint-disable-next-line import/first
import { PaginatedResourceCollection } from '../../src/pagination/PaginatedResourceCollection'
// eslint-disable-next-line import/first
import { isPaginatedResourceCollection, isPaginator } from '../../src/pagination/isPaginator'
// eslint-disable-next-line import/first
import { SimplePaginator } from '../../src/pagination/SimplePaginator'

interface User { id: string, email: string }

class UserResource extends Resource<User> {
  override toArray() {
    return { id: this.resource.id, email: this.resource.email }
  }
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('isPaginator', () => {
  it('is true for LengthAwarePaginator', () => {
    expect(isPaginator(new LengthAwarePaginator([], 0, 10, 1))).toBe(true)
  })

  it('is true for SimplePaginator', () => {
    expect(isPaginator(new SimplePaginator([], 10, 1, false))).toBe(true)
  })

  it('is true for CursorPaginator', () => {
    expect(isPaginator(new CursorPaginator([], 10, null, null))).toBe(true)
  })

  it('is false for arrays and other values', () => {
    expect(isPaginator([])).toBe(false)
    expect(isPaginator({})).toBe(false)
    expect(isPaginator(null)).toBe(false)
    expect(isPaginator('hello')).toBe(false)
  })
})

describe('isPaginatedResourceCollection', () => {
  it('is true for PaginatedResourceCollection instances', () => {
    const pc = new PaginatedResourceCollection(
      new LengthAwarePaginator([], 0, 10, 1),
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    expect(isPaginatedResourceCollection(pc)).toBe(true)
  })

  it('is false for plain ResourceCollection or arrays', () => {
    expect(isPaginatedResourceCollection([])).toBe(false)
    expect(isPaginatedResourceCollection({})).toBe(false)
  })
})

describe('PaginatedResourceCollection', () => {
  it('toArray returns {data, links, meta} with LengthAwarePaginator', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }, { id: 'u-2', email: 'b@x.com' }],
      10,
      2,
      2,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([
      { id: 'u-1', email: 'a@x.com' },
      { id: 'u-2', email: 'b@x.com' },
    ])
    expect(result.meta).toMatchObject({
      current_page: 2,
      last_page: 5,
      total: 10,
      per_page: 2,
    })
    expect(result.links).toMatchObject({
      first: expect.stringContaining('page=1'),
      last: expect.stringContaining('page=5'),
      prev: expect.stringContaining('page=1'),
      next: expect.stringContaining('page=3'),
    })
  })

  it('toArray with SimplePaginator returns the simple meta shape (no last_page, no total)', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new SimplePaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }],
      10,
      1,
      true,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.meta).not.toHaveProperty('last_page')
    expect(result.meta).not.toHaveProperty('total')
    expect(result.meta).toMatchObject({ current_page: 1, per_page: 10 })
  })

  it('toArray with CursorPaginator returns cursor meta shape (next_cursor, prev_cursor)', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new CursorPaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }],
      10,
      'next-encoded',
      null,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.meta).toMatchObject({ next_cursor: 'next-encoded', prev_cursor: null })
  })

  it('toArray with empty paginator returns data: [] and null from/to', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator<User>([], 0, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([])
    expect(result.meta.from).toBe(null)
    expect(result.meta.to).toBe(null)
  })

  it('toArray awaits async Resource.toArray', async () => {
    class AsyncUserResource extends Resource<User> {
      override async toArray() {
        await Promise.resolve()
        return { id: this.resource.id }
      }
    }
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }],
      1,
      10,
      1,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      AsyncUserResource as unknown as new (item: unknown) => AsyncUserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([{ id: 'u-1' }])
  })

  it('toArray serializes nested Resources recursively', async () => {
    class AuthorResource extends Resource<{ name: string }> {
      override toArray() {
        return { name: this.resource.name }
      }
    }
    class PostResource extends Resource<{ id: string, authorName: string }> {
      override toArray() {
        return {
          id: this.resource.id,
          author: new AuthorResource({ name: this.resource.authorName }),
        }
      }
    }
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/posts'))
    const paginator = new LengthAwarePaginator<{ id: string, authorName: string }>(
      [{ id: 'p-1', authorName: 'Ada' }],
      1,
      10,
      1,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      PostResource as unknown as new (item: unknown) => PostResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([{ id: 'p-1', author: { name: 'Ada' } }])
  })

  it('toArray passes the same event to each Resource.toArray', async () => {
    const spy = vi.fn().mockReturnValue({})
    class SpyResource extends Resource<User> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const event = createMockEvent()
    const paginator = new LengthAwarePaginator<User>(
      [{ id: 'u-1', email: 'a' }, { id: 'u-2', email: 'b' }],
      2,
      10,
      1,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      SpyResource as unknown as new (item: unknown) => SpyResource,
    )
    await pc.toArray(event)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, event)
    expect(spy).toHaveBeenNthCalledWith(2, event)
  })
})
