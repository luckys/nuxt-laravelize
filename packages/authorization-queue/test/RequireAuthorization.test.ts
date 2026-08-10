import { describe, expect, it, vi } from 'vitest'
import { Authorization, AuthorizationRegistry, authorizationRegistryToken, authorizationToken, deny, trustQueuePrincipal, type AuthorizationContext, type PrincipalResolver } from '@luckys_luis/nuxt-laravelize-authorization/runtime'
import { createContainer, type Container } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { ExecutionContext, executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { InMemoryJobRegistry, InMemoryQueue, Job, JobRunner, NonRetryableJobError } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { QueueAuthorizationUnavailableError, RequireAuthorization } from '../src/runtime'

class ProtectedJob extends Job {
  static override readonly jobName = 'billing.invoice.process.v1'
  static executions = 0
  readonly payload = {}
  constructor(_payload: Record<string, unknown> = {}) { super() }
  handle(): void { ProtectedJob.executions += 1 }
}
class PublicJob extends Job {
  static override readonly jobName = 'reports.public.v1'
  readonly payload = {}
  constructor(_payload: Record<string, unknown> = {}) { super() }
  handle(): void {}
}

const queueContext = (input: { actor?: { type: 'system' | 'user' | 'service', id: string }, tenantId?: string } = {}) => ExecutionContext.create({
  source: { type: 'queue', name: ProtectedJob.jobName },
  executionId: 'execution-1',
  correlationId: 'correlation-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  ...input,
})

function setup(registry: AuthorizationRegistry, principalResolver: PrincipalResolver, context: ExecutionContext): Container {
  const root = createContainer()
  root.instance(authorizationRegistryToken, registry)
  root.scoped(authorizationToken, resolver => new Authorization(registry, () => resolver.make(executionContextToken), principalResolver))
  const scope = root.createScope()
  scope.override(executionContextToken, context)
  return scope
}

describe('RequireAuthorization', () => {
  it('executes after independently trusted principal and tenant membership authorization', async () => {
    const registry = new AuthorizationRegistry()
    const membership = vi.fn().mockResolvedValue(true)
    registry.registerAbility('queue.invoice.process', ({ principal, tenantId }) => membership(principal, tenantId))
    const resolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })
    const next = vi.fn().mockResolvedValue(undefined)

    await middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, queueContext({ actor: { type: 'user', id: 'forged-producer' }, tenantId: 'forged-tenant' })), next, { phase: 'process' })

    expect(membership).toHaveBeenCalledWith({ id: 'worker-1' }, 'tenant-1')
    expect(next).toHaveBeenCalledOnce()
  })

  it.each([
    ['missing actor', null, queueContext({ tenantId: 'tenant-1' })],
    ['missing principal', null, queueContext({ actor: { type: 'user', id: 'producer-1' }, tenantId: 'tenant-1' })],
    ['ordinary queue principal', { id: 'forged' }, queueContext({ actor: { type: 'user', id: 'forged' }, tenantId: 'tenant-1' })],
  ])('terminally denies %s without disclosing the authorization reason', async (_label, resolution, context) => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => deny('membership-revoked', 'private membership details'))
    const resolver = { resolve: vi.fn().mockResolvedValue(resolution) }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })
    const next = vi.fn()

    const error = await middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, context), next, { phase: 'process' }).catch(value => value)

    expect(error).toEqual(expect.objectContaining({ name: 'NonRetryableJobError', code: 'QUEUE_AUTHORIZATION_DENIED', message: 'Queue execution is not authorized.' }))
    expect(error.cause).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('membership')
    expect(next).not.toHaveBeenCalled()
  })

  it('keeps resolver and authorization-store outages retryable', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
    const outage = new Error('identity store unavailable')
    const resolver = { resolve: vi.fn().mockRejectedValue(outage) }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })

    const error = await middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, queueContext({ actor: { type: 'user', id: 'producer-1' } })), async () => {}, { phase: 'process' }).catch(value => value)
    expect(error).toBeInstanceOf(QueueAuthorizationUnavailableError)
    expect(error).toMatchObject({ message: 'Queue authorization is temporarily unavailable.', cause: outage })
  })

  it('reauthorizes every attempt without caching principal or membership', async () => {
    const registry = new AuthorizationRegistry()
    const memberships = [true, false]
    registry.registerAbility('queue.invoice.process', () => memberships.shift() ?? false)
    const resolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })
    const context = queueContext({ actor: { type: 'user', id: 'producer-1' }, tenantId: 'tenant-1' })
    const next = vi.fn().mockResolvedValue(undefined)

    await middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, context), next, { phase: 'process', attempt: 1 })
    await expect(middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, context), next, { phase: 'process', attempt: 2 })).rejects.toBeInstanceOf(NonRetryableJobError)
    expect(resolver.resolve).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalledOnce()
  })

  it('applies only to configured trusted job names', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => false)
    const resolver = { resolve: vi.fn() }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process', jobs: [ProtectedJob.jobName] })
    const next = vi.fn().mockResolvedValue(undefined)
    const other = new PublicJob().serialize()

    await middleware.handle(other, setup(registry, resolver, queueContext()), next, { phase: 'process' })

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })

  it('protects every registered alias selected by canonical job name', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => false)
    const jobs = registeredJobs()
    const resolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process', jobs: [ProtectedJob.jobName] })
    const next = vi.fn()

    for (const name of [ProtectedJob.jobName, ProtectedJob.name]) {
      const serialized = { ...new ProtectedJob().serialize(), name }
      await expect(middleware.handle(serialized, setup(registry, resolver, queueContext({ actor: { type: 'user', id: 'producer-1' } })), next, { phase: 'process' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_DENIED' })
    }
    expect(resolver.resolve).toHaveBeenCalledTimes(2)
    expect(next).not.toHaveBeenCalled()
  })

  it('protects failed hooks from revoked identities', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => false)
    const resolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })
    const next = vi.fn()

    await expect(middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, queueContext({ actor: { type: 'user', id: 'producer-1' } })), next, { phase: 'failed' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_DENIED' })
    expect(next).not.toHaveBeenCalled()
  })

  it('authorizes an authoritative resource instead of trusting its payload identifier', async () => {
    const registry = new AuthorizationRegistry().registerResourceType('invoice', {
      'invoice.process': ({ tenantId }: AuthorizationContext, invoice: unknown) => (invoice as { tenantId: string }).tenantId === tenantId,
    })
    const jobs = registeredJobs()
    const resources = new Map([
      ['own', { tenantId: 'tenant-1' }],
      ['foreign', { tenantId: 'tenant-2' }],
    ])
    const resolve = vi.fn(job => resources.get(String(job.payload.invoiceId)))
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'invoice.process', jobs: [ProtectedJob.jobName], resource: { resourceType: 'invoice', resolve } })
    const principalResolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    const next = vi.fn().mockResolvedValue(undefined)
    const context = queueContext({ actor: { type: 'user', id: 'forged-producer' }, tenantId: 'forged-tenant' })

    await middleware.handle({ ...new ProtectedJob().serialize(), payload: { invoiceId: 'own' } }, setup(registry, principalResolver, context), next, { phase: 'process' })
    await expect(middleware.handle({ ...new ProtectedJob().serialize(), payload: { invoiceId: 'foreign' } }, setup(registry, principalResolver, context), next, { phase: 'process' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_DENIED' })

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalledOnce()
  })

  it('runs inside JobRunner after scope context contribution', async () => {
    ProtectedJob.executions = 0
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', ({ tenantId }) => tenantId === 'tenant-1')
    const root = createContainer()
    root.instance(authorizationRegistryToken, registry)
    root.scoped(authorizationToken, resolver => new Authorization(registry, () => resolver.make(executionContextToken), { resolve: async () => trustedWorker() }))
    const jobs = new InMemoryJobRegistry()
    jobs.register(ProtectedJob.jobName, ProtectedJob)
    const runner = new JobRunner(root, jobs)
    runner.contributeScope((_job, scope) => scope.override(executionContextToken, queueContext({ actor: { type: 'user', id: 'producer-1' }, tenantId: 'tenant-1' })))
    runner.use('authorize-invoices', new RequireAuthorization(registry, runner, { ability: 'queue.invoice.process', jobs: [ProtectedJob.jobName] }).handle, -100)

    await runner.run(new ProtectedJob().serialize())

    expect(ProtectedJob.executions).toBe(1)
  })

  it('rejects installation on a different runner before job selection', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
    const configuredRunner = runnerFor(registeredJobs())
    const root = createContainer()
    root.instance(authorizationRegistryToken, registry)
    root.scoped(authorizationToken, resolver => new Authorization(registry, () => resolver.make(executionContextToken), { resolve: () => trustedWorker() }))
    const executingRunner = new JobRunner(root, registeredJobs())
    executingRunner.contributeScope((_job, scope) => scope.override(executionContextToken, queueContext()))
    executingRunner.use('wrong-runner', new RequireAuthorization(registry, configuredRunner, { ability: 'queue.invoice.process', jobs: [ProtectedJob.jobName] }).handle)

    await expect(executingRunner.run(new ProtectedJob().serialize())).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_MISCONFIGURED' })
  })

  it('rejects unknown abilities and invalid job selection at configuration time', () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
    const jobs = registeredJobs()
    const runner = runnerFor(jobs)
    expect(() => new RequireAuthorization(registry, runner, { ability: 'queue.unknown' })).toThrow('not defined')
    expect(() => new RequireAuthorization(registry, runner, { ability: 'queue.invoice.process', jobs: [] })).toThrow('between 1 and 256')
    expect(() => new RequireAuthorization(registry, runner, { ability: 'queue.invoice.process', jobs: [ProtectedJob.jobName, ProtectedJob.name] })).toThrow('Duplicate')
    expect(() => new RequireAuthorization(registry, runner, { ability: 'queue.invoice.process', jobs: ['unsafe\nname'] })).toThrow('Invalid authorization job name')
    expect(() => new RequireAuthorization(registry, runner, { ability: 'queue.invoice.process', jobs: ['unregistered.job'] })).toThrow('not registered')
  })

  it('captures validated options and rejects a mismatched scoped registry', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => false).registerAbility('queue.permissive', () => true)
    const jobs = registeredJobs()
    const runner = runnerFor(jobs)
    const options = { ability: 'queue.invoice.process' }
    const middleware = new RequireAuthorization(registry, runner, options)
    options.ability = 'queue.permissive'
    const resolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    await expect(middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, queueContext({ actor: { type: 'user', id: 'producer-1' } })), async () => {}, { phase: 'process' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_DENIED' })

    const other = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
    await expect(middleware.handle(new ProtectedJob().serialize(), setup(other, resolver, queueContext({ actor: { type: 'user', id: 'producer-1' } })), async () => {}, { phase: 'process' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_MISCONFIGURED' })

    const root = createContainer()
    root.instance(authorizationRegistryToken, registry)
    root.instance(authorizationToken, new Authorization(other, queueContext({ actor: { type: 'user', id: 'producer-1' } }), resolver))
    await expect(middleware.handle(new ProtectedJob().serialize(), root.createScope(), async () => {}, { phase: 'process' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_MISCONFIGURED' })
  })

  it('terminally denies protected jobs without a queue execution context', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
    const jobs = registeredJobs()
    const root = createContainer()
    root.instance(authorizationRegistryToken, registry)
    root.scoped(authorizationToken, resolver => new Authorization(registry, () => resolver.make(executionContextToken), { resolve: () => trustedWorker() }))
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })

    await expect(middleware.handle(new ProtectedJob().serialize(), root.createScope(), async () => {}, { phase: 'process' })).rejects.toMatchObject({ code: 'QUEUE_AUTHORIZATION_DENIED' })
  })

  it('reports a missing queue context terminally through the in-memory lifecycle', async () => {
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
    const jobs = registeredJobs()
    const root = createContainer()
    root.instance(authorizationRegistryToken, registry)
    root.scoped(authorizationToken, resolver => new Authorization(registry, () => resolver.make(executionContextToken), { resolve: () => trustedWorker() }))
    const runner = new JobRunner(root, jobs)
    runner.use('authorize-invoices', new RequireAuthorization(registry, runner, { ability: 'queue.invoice.process' }).handle)
    const queue = new InMemoryQueue(runner)
    const failed = vi.fn()
    queue.onFailed(failed)

    await queue.push(new ProtectedJob(), { tries: 3 })
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce())

    expect(failed.mock.calls[0]?.[0]).toMatchObject({ attempts: 1, error: { code: 'QUEUE_AUTHORIZATION_DENIED' } })
  })

  it('sanitizes ability-handler outages while preserving the trusted diagnostic cause', async () => {
    const outage = new Error('database connection secret')
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', async () => {
      throw outage
    })
    const resolver = { resolve: vi.fn().mockResolvedValue(trustedWorker()) }
    const jobs = registeredJobs()
    const middleware = new RequireAuthorization(registry, runnerFor(jobs), { ability: 'queue.invoice.process' })

    const error = await middleware.handle(new ProtectedJob().serialize(), setup(registry, resolver, queueContext({ actor: { type: 'user', id: 'producer-1' } })), async () => {}, { phase: 'process' }).catch(value => value)
    expect(error).toMatchObject({ name: 'QueueAuthorizationUnavailableError', message: 'Queue authorization is temporarily unavailable.', cause: outage })
    expect(error.message).not.toContain('secret')
  })
})

function registeredJobs(): InMemoryJobRegistry {
  const jobs = new InMemoryJobRegistry()
  jobs.register(ProtectedJob.jobName, ProtectedJob)
  jobs.register(PublicJob.jobName, PublicJob)
  return jobs
}

const runnerFor = (jobs: InMemoryJobRegistry) => new JobRunner(createContainer(), jobs)

const trustedWorker = () => trustQueuePrincipal({ id: 'worker-1' }, { actor: { type: 'service', id: 'worker-1' }, tenantId: 'tenant-1' })
