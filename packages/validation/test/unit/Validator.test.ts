import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'

import { ValidationError, Validator } from '../../src/runtime/Validator'

const schema: StandardSchemaV1<string, string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value) {
      if (typeof value === 'string' && value.length >= 3) return { value: value.trim() }
      return { issues: [
        { message: 'Must contain at least three characters.', path: ['users', 0, 'name'] },
        { message: 'Must be a string.', path: ['users', 0, 'name'] },
      ] }
    },
  },
}

describe('Validator', () => {
  it('returns typed transformed values', async () => {
    await expect(new Validator().validate(schema, ' valid ')).resolves.toBe('valid')
  })

  it('returns a safe error bag with nested paths and prefixes', async () => {
    const result = await new Validator().safeValidate(schema, 'x', { prefix: 'body' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors.first('body.users.0.name')).toBe('Must contain at least three characters.')
    expect(result.errors.get('body.users.0.name')).toHaveLength(2)
    expect(result.errors.any()).toBe(true)
  })

  it('throws a ValidationError with defensive error snapshots', async () => {
    const validator = new Validator()
    await expect(validator.validate(schema, 'x')).rejects.toBeInstanceOf(ValidationError)
    try {
      await validator.validate(schema, 'x')
    }
    catch (error) {
      const validation = error as ValidationError
      const snapshot = validation.errors.all() as Record<string, string[]>
      snapshot['users.0.name']?.push('mutated')
      expect(validation.errors.get('users.0.name')).toHaveLength(2)
    }
  })
})
