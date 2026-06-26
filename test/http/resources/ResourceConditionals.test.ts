import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'

interface User {
  id: string
  email: string | null
  admin: boolean
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

class UserResource extends Resource<User> {
  override toArray(_event: H3Event) {
    return {
      id: this.resource.id,
      ...this.when(this.resource.email !== null, { email: this.resource.email }),
      ...this.mergeWhen(this.resource.admin, { admin: true, role: 'admin' }),
    }
  }
}

describe('Resource conditionals — when()', () => {
  it('when(true, value) returns the value', () => {
    class TestResource extends Resource<unknown> {
      override toArray(_event: H3Event) {
        return this.when(true, { key: 'val' }) as Record<string, unknown>
      }
    }
    const result = new TestResource(null).toArray(createMockEvent())
    expect(result).toEqual({ key: 'val' })
  })

  it('when(false, value) returns undefined', () => {
    class TestResource extends Resource<unknown> {
      override toArray(_event: H3Event) {
        return { result: this.when(false, { key: 'val' }) }
      }
    }
    const result = new TestResource(null).toArray(createMockEvent())
    expect(result).toEqual({ result: undefined })
  })

  it('when(false, value, default) returns the default', () => {
    class TestResource extends Resource<unknown> {
      override toArray(_event: H3Event) {
        return { result: this.when(false, 'yes', 'no') }
      }
    }
    const result = new TestResource(null).toArray(createMockEvent())
    expect(result).toEqual({ result: 'no' })
  })
})

describe('Resource conditionals — mergeWhen()', () => {
  it('mergeWhen(true, fields) returns the fields', () => {
    class TestResource extends Resource<unknown> {
      override toArray(_event: H3Event) {
        return {
          id: 1,
          ...this.mergeWhen(true, { admin: true, role: 'admin' }),
        }
      }
    }
    const result = new TestResource(null).toArray(createMockEvent())
    expect(result).toEqual({ id: 1, admin: true, role: 'admin' })
  })

  it('mergeWhen(false, fields) returns an empty object', () => {
    class TestResource extends Resource<unknown> {
      override toArray(_event: H3Event) {
        return {
          id: 1,
          ...this.mergeWhen(false, { admin: true, role: 'admin' }),
        }
      }
    }
    const result = new TestResource(null).toArray(createMockEvent())
    expect(result).toEqual({ id: 1 })
  })
})

describe('Resource conditionals — integration with toArray via spread', () => {
  it('includes email when present and admin fields when admin', () => {
    const resource = new UserResource({ id: 'u-1', email: 'ada@example.com', admin: true })
    const result = resource.toArray(createMockEvent())
    expect(result).toEqual({
      id: 'u-1',
      email: 'ada@example.com',
      admin: true,
      role: 'admin',
    })
  })

  it('omits email when null and omits admin fields when not admin', () => {
    const resource = new UserResource({ id: 'u-2', email: null, admin: false })
    const result = resource.toArray(createMockEvent())
    expect(result).toEqual({ id: 'u-2' })
  })
})
