import { DeadLetterAmbiguousError, DeadLetterNotFoundError, DeadLetterStaleRevisionError } from '@luckys_luis/nuxt-laravelize-dead-letter'
import { describe, expect, it } from 'vitest'
import { deadLetterHttpProblem } from '../src/runtime/server/errors'

describe('dead-letter HTTP error mapping', () => {
  it.each([[new DeadLetterNotFoundError(), 404, 'not_found'], [new DeadLetterStaleRevisionError(), 409, 'stale_revision'], [new DeadLetterAmbiguousError(), 503, 'ambiguous_outcome']])('maps typed errors without exception disclosure', (error, statusCode, code) => {
    expect(deadLetterHttpProblem(error)).toEqual({ statusCode, code })
  })
  it('maps unknown failures to a stable generic response', () => {
    expect(deadLetterHttpProblem(new Error('secret database details'))).toEqual({ statusCode: 500, code: 'internal_error' })
  })
})
