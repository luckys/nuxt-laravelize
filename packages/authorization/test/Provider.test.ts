import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import AuthorizationServiceProvider from '../src/runtime/server/AuthorizationServiceProvider'
import { authorizationRegistryToken, authorizationToken, principalResolverToken } from '../src/runtime/index'

describe('AuthorizationServiceProvider', () => {
  it('shares the registry, scopes authorization and preserves resolver overrides', () => {
    const container = createContainer()
    const customResolver = { resolve: () => ({ id: 'current' }) }
    container.instance(principalResolverToken, customResolver)
    new AuthorizationServiceProvider().register(container)
    const first = container.createScope()
    first.override(executionContextToken, ExecutionContext.create({ source: { type: 'test' }, actor: { type: 'user', id: '1' } }, () => 'one'))
    const second = container.createScope()
    second.override(executionContextToken, ExecutionContext.create({ source: { type: 'test' }, actor: { type: 'user', id: '2' } }, () => 'two'))
    expect(first.make(authorizationRegistryToken)).toBe(second.make(authorizationRegistryToken))
    expect(first.make(authorizationToken)).not.toBe(second.make(authorizationToken))
    expect(first.make(principalResolverToken)).toBe(customResolver)
  })

  it('uses the latest execution context without leaking it between scopes', async () => {
    const container = createContainer()
    const resolve = vi.fn(snapshot => ({ id: snapshot.actor?.id }))
    container.instance(principalResolverToken, { resolve })
    new AuthorizationServiceProvider().register(container)

    const registry = container.make(authorizationRegistryToken)
    registry.registerAbility('document.view', ({ principal, tenantId }) => `${(principal as { id: string }).id}:${tenantId}` === 'replacement:tenant-b')

    const first = container.createScope()
    first.override(executionContextToken, ExecutionContext.create({ source: { type: 'test' }, actor: { type: 'user', id: 'initial' }, tenantId: 'tenant-a' }))
    const firstAuthorization = first.make(authorizationToken)

    const second = container.createScope()
    second.override(executionContextToken, ExecutionContext.create({ source: { type: 'test' }, actor: { type: 'user', id: 'other' }, tenantId: 'tenant-c' }))
    const secondAuthorization = second.make(authorizationToken)

    first.override(executionContextToken, ExecutionContext.create({ source: { type: 'test' }, actor: { type: 'user', id: 'replacement' }, tenantId: 'tenant-b' }))

    expect(await firstAuthorization.inspect('document.view')).toEqual({ allowed: true })
    expect(await secondAuthorization.inspect('document.view')).toEqual({ allowed: false, code: 'forbidden' })
    expect(resolve).toHaveBeenNthCalledWith(1, expect.objectContaining({ actor: { type: 'user', id: 'replacement' }, tenantId: 'tenant-b' }))
    expect(resolve).toHaveBeenNthCalledWith(2, expect.objectContaining({ actor: { type: 'user', id: 'other' }, tenantId: 'tenant-c' }))
  })
})
