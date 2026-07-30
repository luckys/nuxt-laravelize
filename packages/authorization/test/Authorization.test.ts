import { describe, expect, it, vi } from 'vitest'
import { ExecutionContext } from '@nuxt-laravelize/execution-context/runtime'
import { Authorization, AuthorizationRegistry, AbilityNotDefinedError, DuplicateAbilityError, DuplicateResourceTypeError, allow, deny, trustQueuePrincipal } from '../src/runtime/index'

const context = (actor = true) => ExecutionContext.create({ source: { type: 'test' }, ...(actor ? { actor: { type: 'user' as const, id: 'user-1' }, tenantId: 'tenant-1' } : {}) }, () => 'id')
const resolver = { resolve: vi.fn(async (snapshot: ReturnType<ExecutionContext['snapshot']>) => ({ id: snapshot.actor!.id, active: true })) }

describe('Authorization', () => {
  it('resolves the current principal and returns typed decisions', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', ({ principal, tenantId }, report) => Boolean(principal) && tenantId === 'tenant-1' && report === 'report-1')
    const authorization = new Authorization(registry, context(), resolver)
    expect(await authorization.inspect('report.view', { args: ['report-1'] })).toEqual({ allowed: true })
    expect(await authorization.denies('report.view', { args: ['other'] })).toBe(true)
    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1', source: { type: 'test' } }))
  })
  it('fails closed without an actor or reloadable principal', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', () => true)
    expect(await new Authorization(registry, context(false), resolver).inspect('report.view')).toEqual({ allowed: false, code: 'unauthenticated' })
    expect(await new Authorization(registry, context(), { resolve: () => null }).inspect('report.view')).toEqual({ allowed: false, code: 'principal-not-found' })
    expect(await new Authorization(registry, context(), { resolve: () => undefined }).inspect('report.view')).toEqual({ allowed: false, code: 'principal-not-found' })
  })
  it('centrally rejects ordinary principal resolution for queue-restored provenance', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', () => true)
    const queueContext = ExecutionContext.create({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' }, tenantId: 'propagated-tenant' }, () => 'id')
    const ordinaryResolver = { resolve: vi.fn((snapshot) => {
      expect(Object.isFrozen(snapshot)).toBe(true)
      expect(Object.isFrozen(snapshot.actor)).toBe(true)
      return { id: snapshot.actor?.id }
    }) }
    expect(await new Authorization(registry, queueContext, ordinaryResolver).inspect('report.view')).toEqual({ allowed: false, code: 'untrusted-queue-principal' })
    expect(ordinaryResolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' } }))
  })
  it('lets a resolver explicitly reject queue-restored provenance', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', () => true)
    const queueContext = ExecutionContext.create({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' }, tenantId: 'propagated-tenant' }, () => 'id')
    const queueAwareResolver = { resolve: vi.fn(snapshot => snapshot.source.type === 'queue' ? null : { id: snapshot.actor?.id }) }
    expect(await new Authorization(registry, queueContext, queueAwareResolver).inspect('report.view')).toEqual({ allowed: false, code: 'principal-not-found' })
    expect(queueAwareResolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' } }))
  })
  it('accepts an explicitly trusted queue principal resolution', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', ({ principal, actor, tenantId }) => (principal as { id: string }).id === 'verified-worker' && actor.id === 'verified-actor' && tenantId === 'verified-tenant')
    const queueContext = ExecutionContext.create({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' }, tenantId: 'forged-tenant' }, () => 'id')
    const verifiedResolver = { resolve: () => trustQueuePrincipal({ id: 'verified-worker' }, { actor: { type: 'service', id: 'verified-actor' }, tenantId: 'verified-tenant' }) }
    expect(await new Authorization(registry, queueContext, verifiedResolver).inspect('report.view')).toEqual({ allowed: true })
  })
  it('rejects a trusted queue principal without a verified actor and tenant binding', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', () => true)
    const queueContext = ExecutionContext.create({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' }, tenantId: 'forged-tenant' }, () => 'id')
    expect(await new Authorization(registry, queueContext, { resolve: () => trustQueuePrincipal({ id: 'verified-worker' }) }).inspect('report.view')).toEqual({ allowed: false, code: 'untrusted-queue-identity' })
  })
  it('ignores string queue trust claims and validates branded wrappers', async () => {
    const registry = new AuthorizationRegistry().registerAbility('report.view', () => true)
    const queueContext = ExecutionContext.create({ source: { type: 'queue' }, actor: { type: 'user', id: 'propagated' } }, () => 'id')
    const malformed = { queuePrincipalTrust: 'independently-verified', principal: { id: 'forged' } }
    expect(await new Authorization(registry, queueContext, { resolve: () => malformed as never }).inspect('report.view')).toEqual({ allowed: false, code: 'untrusted-queue-principal' })
    const trusted = trustQueuePrincipal({ id: 'verified' })
    const brand = Object.getOwnPropertySymbols(trusted)[0]!
    const forged = Object.defineProperties({}, {
      principal: { enumerable: true, get: () => ({ id: 'forged' }) },
      [brand]: { enumerable: true, value: true },
    })
    await expect(new Authorization(registry, queueContext, { resolve: () => forged as never }).inspect('report.view')).rejects.toThrow('Invalid trusted queue principal resolution')
    const mutable = { principal: { id: 'forged' }, [brand]: true }
    await expect(new Authorization(registry, queueContext, { resolve: () => mutable as never }).inspect('report.view')).rejects.toThrow('Invalid trusted queue principal resolution')
    const accessorIdentity = Object.defineProperty({}, 'actor', { enumerable: true, get: () => ({ type: 'service', id: 'forged' }) })
    expect(() => trustQueuePrincipal({ id: 'verified' }, accessorIdentity as never)).toThrow('Invalid trusted queue identity')
    const accessorActor = Object.defineProperties({}, { type: { enumerable: true, get: () => 'service' }, id: { enumerable: true, get: () => 'forged' } })
    expect(() => trustQueuePrincipal({ id: 'verified' }, { actor: accessorActor } as never)).toThrow('Invalid trusted queue actor')
  })
  it('does not confuse ordinary principal properties with the private queue trust brand', async () => {
    const principal = { id: 'user-1', queuePrincipalTrust: 'application-data' }
    const registry = new AuthorizationRegistry().registerAbility('report.view', ({ principal: resolved }) => resolved === principal)
    expect(await new Authorization(registry, context(), { resolve: () => principal }).allows('report.view')).toBe(true)
  })
  it('runs policy before first and uses explicit resource type keys', async () => {
    const action = vi.fn(() => true)
    const registry = new AuthorizationRegistry().registerResourceType('document', { 'before': (_context, _ability, resource) => resource === 'owned' ? allow({ code: 'owner' }) : null, 'document.update': action })
    const authorization = new Authorization(registry, context(), resolver)
    expect(await authorization.inspect('document.update', { resourceType: 'document', resource: 'owned' })).toEqual({ allowed: true, code: 'owner' })
    expect(action).not.toHaveBeenCalled()
    expect(await authorization.allows('document.update', { resourceType: 'document', resource: 'other' })).toBe(true)
  })
  it('verifies the policy action before invoking before', async () => {
    const before = vi.fn(() => true)
    const authorization = new Authorization(new AuthorizationRegistry().registerResourceType('document', { before }), context(), resolver)
    await expect(authorization.inspect('document.typo', { resourceType: 'document', resource: 'owned' })).rejects.toBeInstanceOf(AbilityNotDefinedError)
    expect(before).not.toHaveBeenCalled()
  })
  it('reserves before for the policy hook and never dispatches it as an action', async () => {
    const before = vi.fn(() => true)
    const authorization = new Authorization(new AuthorizationRegistry().registerResourceType('document', { before, 'document.view': () => true }), context(), resolver)
    await expect(authorization.inspect('before', { resourceType: 'document', resource: 'owned' })).rejects.toBeInstanceOf(AbilityNotDefinedError)
    expect(before).not.toHaveBeenCalled()
  })
  it('validates enumerable policy actions at registration', () => {
    expect(() => new AuthorizationRegistry().registerResourceType('document', { 'document.view': true } as never)).toThrow('Invalid authorization policy action')
  })
  it('compiles policies without inherited handlers or later mutation effects', async () => {
    const inherited = Object.create({ 'document.delete': () => true }) as Record<string, unknown>
    inherited['document.view'] = () => true
    expect(() => new AuthorizationRegistry().registerResourceType('document', inherited as never)).toThrow(TypeError)

    const action = vi.fn(() => true)
    const before = vi.fn(() => null)
    const policy: Record<string, unknown> = { before, 'document.view': action }
    const registry = new AuthorizationRegistry().registerResourceType('document', policy as never)
    const compiled = registry.policy('document')!
    expect(Object.getPrototypeOf(compiled)).toBeNull()
    expect(Object.isFrozen(compiled)).toBe(true)
    policy.before = () => false
    policy['document.view'] = () => false
    ;(policy as Record<string, unknown>)['document.delete'] = () => true
    const authorization = new Authorization(registry, context(), resolver)
    expect(await authorization.allows('document.view', { resourceType: 'document', resource: {} })).toBe(true)
    expect(action).toHaveBeenCalledOnce()
    await expect(authorization.inspect('document.delete', { resourceType: 'document', resource: {} })).rejects.toBeInstanceOf(AbilityNotDefinedError)
  })
  it('rejects accessor policy handlers and malformed own keys without invoking getters', () => {
    const getter = vi.fn(() => () => true)
    const accessor = Object.defineProperty({}, 'document.view', { enumerable: true, get: getter })
    expect(() => new AuthorizationRegistry().registerResourceType('document', accessor as never)).toThrow(TypeError)
    expect(getter).not.toHaveBeenCalled()
    expect(() => new AuthorizationRegistry().registerResourceType('document', { 'Bad Key': () => true } as never)).toThrow(TypeError)
  })
  it('runtime-validates ability handlers at registration', () => {
    expect(() => new AuthorizationRegistry().registerAbility('report.view', true as never)).toThrow('Invalid authorization ability handler')
  })
  it('rejects resource without an explicit resource type', async () => {
    const authorization = new Authorization(new AuthorizationRegistry().registerAbility('document.update', () => true), context(), resolver)
    await expect(authorization.inspect('document.update', { resource: 'owned' })).rejects.toThrow('resourceType is required')
  })
  it.each([
    undefined, null, 1, 'true', [], new Boolean(true), {}, { allowed: 1 }, { allowed: true, extra: true },
    { allowed: false }, { allowed: false, code: 'UPPERCASE' }, { allowed: true, reason: '' },
    { allowed: true, [Symbol('unexpected')]: true },
  ])('rejects malformed runtime decision %#', async (malformed) => {
    const authorization = new Authorization(new AuthorizationRegistry().registerAbility('unsafe', () => malformed as never), context(), resolver)
    await expect(authorization.inspect('unsafe')).rejects.toBeInstanceOf(TypeError)
    await expect(authorization.allows('unsafe')).rejects.toBeInstanceOf(TypeError)
  })
  it('supports authorize, any, none and portable errors', async () => {
    const registry = new AuthorizationRegistry().registerAbility('allow', () => allow()).registerAbility('deny', () => deny('tenant-mismatch'))
    const authorization = new Authorization(registry, context(), resolver)
    expect(await authorization.any(['deny', 'allow'])).toBe(true)
    expect(await authorization.none(['deny'])).toBe(true)
    await expect(authorization.authorize('deny')).rejects.toMatchObject({ name: 'AuthorizationDeniedError', decision: { allowed: false, code: 'tenant-mismatch' } })
    await expect(authorization.inspect('missing')).rejects.toBeInstanceOf(AbilityNotDefinedError)
  })
  it('rejects duplicates and invalid bounded decisions', () => {
    const registry = new AuthorizationRegistry().registerAbility('view', () => true).registerResourceType('document', {})
    expect(() => registry.registerAbility('view', () => true)).toThrow(DuplicateAbilityError)
    expect(() => registry.registerResourceType('document', {})).toThrow(DuplicateResourceTypeError)
    expect(() => deny('UPPERCASE')).toThrow(TypeError)
  })
})
