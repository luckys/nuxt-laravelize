import type { H3Event } from 'h3'
import * as h3 from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'
import { isResource, isResourceCollection } from '../../../src/http/resources/isResource'
import { serializeResource } from '../../../src/http/resources/serializeResource'
import { LengthAwarePaginator } from '../../../src/pagination/LengthAwarePaginator'
import { PaginatedResourceCollection } from '../../../src/pagination/PaginatedResourceCollection'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRequestURL: vi.fn(),
  }
})

interface User { id: string }

class UserResource extends Resource<User> {
  override toArray() {
    return { id: this.resource.id }
  }
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('isResource / isResourceCollection', () => {
  it('isResource is true for Resource instances and false otherwise', () => {
    expect(isResource(new UserResource({ id: 'u-1' }))).toBe(true)
    expect(isResource({})).toBe(false)
    expect(isResource(null)).toBe(false)
    expect(isResource('x')).toBe(false)
  })

  it('isResourceCollection is true for ResourceCollection instances and false otherwise', () => {
    expect(isResourceCollection(new ResourceCollection([]))).toBe(true)
    expect(isResourceCollection([])).toBe(false)
    expect(isResourceCollection(new UserResource({ id: 'u-1' }))).toBe(false)
  })
})

describe('serializeResource', () => {
  it('serializes a Resource into a plain object', async () => {
    const result = await serializeResource(new UserResource({ id: 'u-1' }), createMockEvent())

    expect(result).toEqual({ id: 'u-1' })
  })

  it('serializes a ResourceCollection into a plain array', async () => {
    const result = await serializeResource(
      new ResourceCollection([new UserResource({ id: 'u-1' }), new UserResource({ id: 'u-2' })]),
      createMockEvent(),
    )

    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('recursively serializes a plain object containing Resources', async () => {
    const value = {
      user: new UserResource({ id: 'u-1' }),
      tag: 'static',
    }

    const result = await serializeResource(value, createMockEvent())

    expect(result).toEqual({ user: { id: 'u-1' }, tag: 'static' })
  })

  it('recursively serializes a plain array containing Resources', async () => {
    const value = [new UserResource({ id: 'u-1' }), { static: true }]

    const result = await serializeResource(value, createMockEvent())

    expect(result).toEqual([{ id: 'u-1' }, { static: true }])
  })

  it('resolves a Resource whose toArray returns another Resource recursively', async () => {
    class WrappingResource extends Resource<User> {
      override toArray() {
        return { inner: new UserResource(this.resource) } as unknown as Record<string, unknown>
      }
    }

    const result = await serializeResource(new WrappingResource({ id: 'u-1' }), createMockEvent())

    expect(result).toEqual({ inner: { id: 'u-1' } })
  })

  it('returns primitives, null, and Date untouched', async () => {
    const event = createMockEvent()
    const date = new Date('2026-05-24T00:00:00Z')

    expect(await serializeResource(null, event)).toBe(null)
    expect(await serializeResource(undefined, event)).toBe(undefined)
    expect(await serializeResource(42, event)).toBe(42)
    expect(await serializeResource('hello', event)).toBe('hello')
    expect(await serializeResource(true, event)).toBe(true)
    expect(await serializeResource(date, event)).toBe(date)
  })

  it('serializes a deeply nested mixed structure', async () => {
    const value = {
      meta: { count: 2 },
      users: [
        new UserResource({ id: 'u-1' }),
        { wrapped: new UserResource({ id: 'u-2' }) },
      ],
    }

    const result = await serializeResource(value, createMockEvent())

    expect(result).toEqual({
      meta: { count: 2 },
      users: [{ id: 'u-1' }, { wrapped: { id: 'u-2' } }],
    })
  })
})

describe('serializeResource — PaginatedResourceCollection branch', () => {
  class PaginatedTestResource extends Resource<{ id: string }> {
    override toArray() {
      return { id: this.resource.id }
    }
  }

  it('returns {data, links, meta} when value is a PaginatedResourceCollection', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator([{ id: 'a' }], 1, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      PaginatedTestResource as unknown as new (item: unknown) => PaginatedTestResource,
    )
    const result = await serializeResource(pc, createMockEvent()) as {
      data: unknown[]
      links: Record<string, string | null>
      meta: Record<string, unknown>
    }
    expect(result.data).toEqual([{ id: 'a' }])
    expect(result.meta).toMatchObject({ current_page: 1 })
    expect(result.links).toBeDefined()
  })

  it('recursively serializes a plain object containing a PaginatedResourceCollection', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator([{ id: 'a' }], 1, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      PaginatedTestResource as unknown as new (item: unknown) => PaginatedTestResource,
    )
    const value = { users: pc, tag: 'demo' }
    const result = await serializeResource(value, createMockEvent()) as {
      users: { data: unknown[] }
      tag: string
    }
    expect(result.tag).toBe('demo')
    expect(result.users.data).toEqual([{ id: 'a' }])
  })
})
