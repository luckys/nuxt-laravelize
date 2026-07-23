import { describe, expect, it } from 'vitest'
import { assertNoPageCollision, assertNoServerHandlerCollision, routePatternsCollide } from '../src/module'

describe('module route collision detection', () => {
  it('rejects normalized route and method collisions', () => {
    expect(() => assertNoServerHandlerCollision([{ route: '/api/dead/', method: 'GET' }], '/api/dead', 'get')).toThrow(/collision/i)
    expect(() => assertNoServerHandlerCollision([{ route: '/api/dead', method: 'post' }], '/api/dead', 'get')).not.toThrow()
  })
  it('rejects page name or normalized path collisions', () => {
    expect(() => assertNoPageCollision([{ name: 'other', path: '/operations/dead/' }], 'dead', '/operations/dead')).toThrow(/collision/i)
    expect(() => assertNoPageCollision([{ name: 'dead', path: '/other' }], 'dead', '/operations/dead')).toThrow(/collision/i)
  })
  it('treats renamed parameters and wildcard forms as matching routes', () => {
    expect(routePatternsCollide('/api/dead/:id', '/api/dead/:deadLetterId')).toBe(true)
    expect(routePatternsCollide('/api/dead/[id]/payload', '/api/dead/:deadLetterId/payload')).toBe(true)
    expect(routePatternsCollide('/api/dead/[...path]', '/api/dead/item/payload')).toBe(true)
    expect(routePatternsCollide('/api/other/:id', '/api/dead/:deadLetterId')).toBe(false)
  })
  it.each(['/**', '/*', '/(.*)', '/:name(.*)*', '/:name*', '/[...name]', '/[[...name]]'])('treats %s as a broad catch-all', (route) => {
    expect(routePatternsCollide(route, '/api/operations/dead-letters/source/queue/id')).toBe(true)
    expect(() => assertNoServerHandlerCollision([{ route }], '/api/operations/dead-letters', 'get')).toThrow(/collision/i)
  })
  it('rejects a dynamic page that can match the privileged static page', () => {
    expect(() => assertNoPageCollision([{ name: 'dynamic', path: '/operations/:section' }], 'dead', '/operations/dead-letters')).toThrow(/collision/i)
  })
})
