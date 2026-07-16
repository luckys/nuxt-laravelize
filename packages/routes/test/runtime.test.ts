import { describe, expect, it } from 'vitest'
import { defineRoutes, route } from '../src/public-runtime'

describe('typed routes runtime', () => {
  const routes = defineRoutes({
    users: { show: route('GET', '/users/{user}'), files: route('GET', '/files/{path*}') },
    search: route('POST', '/search/{section?}'),
    download: route('GET', '/download/{path+}'),
  }, { baseURL: 'https://example.test/api/' })

  it('builds callable nested routes and exposes metadata', () => {
    expect(routes.users.show({ user: { toRoute: () => 'a/b' } })).toEqual({ url: 'https://example.test/api/users/a%2Fb', method: 'GET' })
    expect(routes.users.show.definition).toEqual({ method: 'GET', path: '/users/{user}' })
    expect(routes.users.show.url({ user: 42 })).toBe('https://example.test/api/users/42')
  })

  it('handles optional and catch-all parameters', () => {
    expect(routes.search({})).toEqual({ url: 'https://example.test/api/search', method: 'POST' })
    expect(routes.users.files({ path: ['one two', 'three/four'] }).url).toBe('https://example.test/api/files/one%20two/three/four')
  })

  it('serializes query deterministically and omits nullish values', () => {
    expect(routes.users.show({ user: 1 }, { query: { z: null, tags: ['b', 'a'], active: true, draft: false } }).url)
      .toBe('https://example.test/api/users/1?active=1&draft=0&tags=b&tags=a')
  })

  it('reports missing parameters', () => {
    expect(() => routes.users.show({} as never)).toThrow('Missing required route parameter "user"')
  })

  it.each(['.', '..', 'safe/../secret'] as const)('rejects traversal catch-all value %s', (path) => {
    expect(() => routes.download({ path })).toThrow('forbidden dot segment')
  })

  it('rejects empty required catch-all values', () => {
    expect(() => routes.download({ path: [] } as never)).toThrow('cannot be empty')
    expect(() => routes.download({ path: '' })).toThrow('cannot be empty')
  })
})
