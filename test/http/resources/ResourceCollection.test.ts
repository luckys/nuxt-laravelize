import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'

interface User {
  id: string
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

class UserResource extends Resource<User> {
  override toArray() {
    return { id: this.resource.id }
  }
}

describe('ResourceCollection', () => {
  it('serializes each item using its toArray when toArray is called', async () => {
    const collection = new ResourceCollection([
      new UserResource({ id: 'u-1' }),
      new UserResource({ id: 'u-2' }),
    ])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('passes the same event to every item toArray', async () => {
    const spy = vi.fn().mockReturnValue({})

    class SpyResource extends Resource<User> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }

    const event = createMockEvent()
    const collection = new ResourceCollection([
      new SpyResource({ id: 'u-1' }),
      new SpyResource({ id: 'u-2' }),
    ])

    await collection.toArray(event)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, event)
    expect(spy).toHaveBeenNthCalledWith(2, event)
  })

  it('returns an empty array when the collection has no items', async () => {
    const collection = new ResourceCollection([])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([])
  })

  it('exposes the items as a readonly field', () => {
    const items = [new UserResource({ id: 'u-1' })]
    const collection = new ResourceCollection(items)

    expect(collection.items).toEqual(items)
  })
})

describe('Resource.collection', () => {
  it('builds a ResourceCollection by mapping items through the resource constructor', async () => {
    const collection = UserResource.collection([{ id: 'u-1' }, { id: 'u-2' }])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('returns an empty ResourceCollection when given an empty array', async () => {
    const collection = UserResource.collection([])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([])
  })
})
