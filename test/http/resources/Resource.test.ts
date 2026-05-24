import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'

interface User {
  id: string
  email: string
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('Resource', () => {
  it('exposes the wrapped resource as a readonly field', () => {
    class UserResource extends Resource<User> {
      override toArray() {
        return { id: this.resource.id, email: this.resource.email }
      }
    }

    const user = { id: 'u-1', email: 'ada@example.com' }
    const subject = new UserResource(user)

    expect(subject.resource).toBe(user)
  })

  it('invokes toArray with the event and returns the expected shape', async () => {
    class UserResource extends Resource<User> {
      override toArray(_event: H3Event) {
        return { id: this.resource.id }
      }
    }

    const event = createMockEvent()
    const subject = new UserResource({ id: 'u-1', email: 'ada@example.com' })

    const result = await subject.toArray(event)

    expect(result).toEqual({ id: 'u-1' })
  })

  it('supports an async toArray implementation', async () => {
    class UserResource extends Resource<User> {
      override async toArray(_event: H3Event) {
        await Promise.resolve()
        return { id: this.resource.id }
      }
    }

    const subject = new UserResource({ id: 'u-1', email: 'ada@example.com' })

    const result = await subject.toArray(createMockEvent())

    expect(result).toEqual({ id: 'u-1' })
  })

  it('passes the same event reference to toArray', () => {
    const spy = vi.fn().mockReturnValue({})

    class UserResource extends Resource<User> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }

    const event = createMockEvent()
    new UserResource({ id: 'u-1', email: 'ada@example.com' }).toArray(event)

    expect(spy).toHaveBeenCalledWith(event)
  })
})
