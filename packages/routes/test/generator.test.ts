import { describe, expect, it } from 'vitest'
import { mergeRouteTrees, renderRoutesModule, validateRouteTree } from '../src/generator'
import { route } from '../src/public-runtime'

describe('routes generator', () => {
  it('renders deterministic generated source', () => {
    expect(renderRoutesModule({ health: route('GET', '/health') }, '/api')).toContain('export const routes = defineRoutes')
  })

  it('diagnoses duplicate endpoints', () => {
    expect(() => validateRouteTree({ first: route('GET', '/same'), second: route('GET', '/same') })).toThrow('Duplicate route endpoint GET /same')
  })

  it('diagnoses names and prefixes colliding across declarations', () => {
    expect(() => mergeRouteTrees([{ users: route('GET', '/users') }, { users: { show: route('GET', '/users/{user}') } }]))
      .toThrow('name/prefix collision: "users"')
  })

  it('normalizes paths before duplicate endpoint detection', () => {
    expect(() => validateRouteTree({ first: route('GET', '/same/'), second: route('GET', '//same') })).toThrow('Duplicate route endpoint GET /same')
  })

  it('rejects static traversal and reserved names', () => {
    expect(() => validateRouteTree({ unsafe: route('GET', '/safe/../secret') })).toThrow('forbidden dot segment')
    const polluted = Object.create(null) as Record<string, ReturnType<typeof route>>
    Object.defineProperty(polluted, '__proto__', { enumerable: true, value: route('GET', '/unsafe') })
    expect(() => mergeRouteTrees([polluted])).toThrow('Reserved route name')
  })
})
