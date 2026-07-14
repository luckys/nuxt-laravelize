import { describe, expect, it } from 'vitest'
import { Resource } from '../../src/http/resources/Resource'

class UserResource extends Resource<{ name: string }> {
  toArray(): Record<string, unknown> { return { name: this.resource.name } }
}

describe('Resource', () => {
  it('maps plain collections without pagination dependencies', () => {
    const collection = UserResource.collection([{ name: 'Ada' }])
    expect(collection.items[0]).toBeInstanceOf(UserResource)
  })
})
