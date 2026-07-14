import { describe, expect, it } from 'vitest'
import { Factory } from '../../src/database/factories/Factory'

class UserFactory extends Factory<{ name: string }> {
  protected definition(): { name: string } { return { name: 'Ada' } }
}

describe('Factory', () => {
  it('rejects an empty sequence', () => {
    expect(() => new UserFactory().sequence([])).toThrow('sequence must contain at least one state')
  })
})
