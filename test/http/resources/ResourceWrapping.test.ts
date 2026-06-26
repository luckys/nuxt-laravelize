import type { H3Event } from 'h3'
import * as h3 from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'
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

describe('Resource wrapping', () => {
  afterEach(() => {
    Resource.restoreWrapping()
  })

  it('wraps a single Resource in { data: ... } by default', async () => {
    const result = await serializeResource(new UserResource({ id: 'u-1' }), createMockEvent())
    expect(result).toEqual({ data: { id: 'u-1' } })
  })

  it('does NOT wrap after Resource.withoutWrapping() is called', async () => {
    Resource.withoutWrapping()
    const result = await serializeResource(new UserResource({ id: 'u-1' }), createMockEvent())
    expect(result).toEqual({ id: 'u-1' })
  })

  it('does NOT double-wrap a ResourceCollection (array output)', async () => {
    const collection = new ResourceCollection([
      new UserResource({ id: 'u-1' }),
      new UserResource({ id: 'u-2' }),
    ])
    const result = await serializeResource(collection, createMockEvent())
    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('does NOT double-wrap a PaginatedResourceCollection (handles its own wrapping)', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator([{ id: 'a' }], 1, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await serializeResource(pc, createMockEvent()) as {
      data: unknown[]
      links: Record<string, string | null>
      meta: Record<string, unknown>
    }
    expect(result.data).toEqual([{ id: 'a' }])
    expect(result.links).toBeDefined()
    expect(result.meta).toMatchObject({ current_page: 1 })
  })

  it('does NOT wrap nested resources inside toArray (only outermost)', async () => {
    class OuterResource extends Resource<User> {
      override toArray() {
        return {
          id: this.resource.id,
          nested: new UserResource(this.resource),
        }
      }
    }

    const result = await serializeResource(new OuterResource({ id: 'u-1' }), createMockEvent())
    expect(result).toEqual({ data: { id: 'u-1', nested: { id: 'u-1' } } })
  })
})
