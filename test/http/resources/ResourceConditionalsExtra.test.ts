import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('Resource conditionals', () => {
  it('when(true) includes fields', () => {
    class UserResource extends Resource<{ id: string, email: string | null }> {
      override toArray(_event: H3Event) {
        return {
          id: this.resource.id,
          ...this.when(this.resource.email !== null, { email: this.resource.email }),
        }
      }
    }
    const result = new UserResource({ id: 'u-1', email: 'ada@example.com' }).toArray(createMockEvent())
    expect(result).toEqual({ id: 'u-1', email: 'ada@example.com' })
  })

  it('when(false) omits fields', () => {
    class UserResource extends Resource<{ id: string, email: string | null }> {
      override toArray(_event: H3Event) {
        return {
          id: this.resource.id,
          ...this.when(this.resource.email !== null, { email: this.resource.email }),
        }
      }
    }
    const result = new UserResource({ id: 'u-2', email: null }).toArray(createMockEvent())
    expect(result).toEqual({ id: 'u-2' })
  })

  it('mergeWhen(true) merges fields', () => {
    class UserResource extends Resource<{ id: string, admin: boolean }> {
      override toArray(_event: H3Event) {
        return {
          id: this.resource.id,
          ...this.mergeWhen(this.resource.admin, { role: 'admin' }),
        }
      }
    }
    const result = new UserResource({ id: 'u-1', admin: true }).toArray(createMockEvent())
    expect(result).toEqual({ id: 'u-1', role: 'admin' })
  })

  it('mergeWhen(false) omits fields', () => {
    class UserResource extends Resource<{ id: string, admin: boolean }> {
      override toArray(_event: H3Event) {
        return {
          id: this.resource.id,
          ...this.mergeWhen(this.resource.admin, { role: 'admin' }),
        }
      }
    }
    const result = new UserResource({ id: 'u-1', admin: false }).toArray(createMockEvent())
    expect(result).toEqual({ id: 'u-1' })
  })
})
