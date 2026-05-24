import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'
import { isResource, isResourceCollection } from '../../../src/http/resources/isResource'
import { serializeResource } from '../../../src/http/resources/serializeResource'

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
