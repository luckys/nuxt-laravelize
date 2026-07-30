import { describe, expect, it, vi } from 'vitest'
import { Authorization, AuthorizationRegistry, authorizationRegistryToken, authorizationToken, principalResolverToken, trustQueuePrincipal } from '@nuxt-laravelize/authorization/runtime'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { InMemoryJobRegistry, Job, JobAdmissionMetadataContributorRegistry, JobMetadataContributorRegistry, JobRunner, JobSerializer, readJobDispatchIdentity } from '@nuxt-laravelize/queue/runtime'
import { installQueueDelegation, QUEUE_DELEGATION_METADATA_KEY, QueueDelegationDeniedError, QueueDelegationUnavailableError, type QueueDelegationAuthenticator, type QueueDelegationClaimsV1, type QueueDelegationIssueContext, type QueueDelegationIssuer, type QueueDelegationVerifier } from '../src/runtime'
import { RequireAuthorization } from '../src/runtime/RequireAuthorization'

class DelegatedJob extends Job {
  static override readonly jobName = 'billing.delegated.v1'
  static executions = 0
  readonly payload: Record<string, unknown>
  constructor(payload: Record<string, unknown> = { invoiceId: 'invoice-1' }) {
    super()
    this.payload = payload
  }

  handle(): void { DelegatedJob.executions += 1 }
}

class PublicJob extends Job {
  static override readonly jobName = 'reports.public.v1'
  readonly payload = {}
  handle(): void {}
}

const producerContext = () => ExecutionContext.create({
  source: { type: 'http', name: 'invoices.create' },
  executionId: 'producer-execution',
  correlationId: 'producer-correlation',
  actor: { type: 'user', id: 'user-1' },
  tenantId: 'tenant-1',
  startedAt: '2026-01-01T00:00:00.000Z',
})

describe('queue delegation', () => {
  it('issues an opaque credential from immutable final admission facts', () => {
    const issue = vi.fn((_context: QueueDelegationIssueContext) => 'signed.credential')
    const setup = configuredDelegation({ issue })

    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)
    const dispatch = readJobDispatchIdentity(serialized)

    expect(issue).toHaveBeenCalledOnce()
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      audience: 'workers.internal',
      admission: {
        version: 1,
        queue: 'critical',
        serializedJobName: DelegatedJob.jobName,
        canonicalJobName: DelegatedJob.jobName,
        dispatch,
      },
      context: expect.objectContaining({ actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' }),
    }))
    expect(Object.isFrozen(issue.mock.calls[0]![0])).toBe(true)
    expect(Object.isFrozen(issue.mock.calls[0]![0].admission)).toBe(true)
    expect(serialized).toMatchObject({
      version: 2,
      metadata: { [QUEUE_DELEGATION_METADATA_KEY]: { version: 1, credential: 'signed.credential' } },
    })
  })

  it('authenticates a bound delegation before current ability and membership checks', async () => {
    DelegatedJob.executions = 0
    const membership = vi.fn().mockResolvedValue(true)
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', ({ principal, tenantId }) => membership(principal, tenantId))
    const setup = configuredDelegation({ registry })
    setup.runner.use('authorize', new RequireAuthorization(registry, setup.runner, { ability: 'queue.invoice.process', jobs: [DelegatedJob.jobName] }).handle)
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await setup.runner.run(serialized, { queue: 'critical', attempt: 1, maxAttempts: 3 })

    expect(setup.verify).toHaveBeenCalledOnce()
    expect(setup.authenticate).toHaveBeenCalledOnce()
    expect(membership).toHaveBeenCalledWith({ id: 'current-user-1' }, 'tenant-1')
    expect(DelegatedJob.executions).toBe(1)
  })

  it('replaces an authorization service resolved before delegation authentication', async () => {
    DelegatedJob.executions = 0
    const registry = new AuthorizationRegistry().registerAbility('queue.invoice.process', ({ principal }) => (principal as { id: string }).id === 'current-user-1')
    const setup = configuredDelegation({ registry, captureAuthorizationEarly: true })
    setup.runner.use('authorize', new RequireAuthorization(registry, setup.runner, { ability: 'queue.invoice.process' }).handle)
    setup.runner.use('captured-authorization', async (_job, _scope, next) => {
      await setup.capturedAuthorization()!.authorize('queue.invoice.process')
      await next()
    }, 1)
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await setup.runner.run(serialized, { queue: 'critical' })

    expect(DelegatedJob.executions).toBe(1)
  })

  it('re-verifies credentials and reloads the principal on every process and failed-hook execution', async () => {
    const setup = configuredDelegation()
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await setup.runner.run(serialized, { queue: 'critical', attempt: 1 })
    await setup.runner.run(serialized, { queue: 'critical', attempt: 2 })
    await setup.runner.failed(serialized, new Error('job failed'), { queue: 'critical', attempt: 2 })

    expect(setup.verify).toHaveBeenCalledTimes(3)
    expect(setup.authenticate).toHaveBeenCalledTimes(3)
  })

  it('accepts epoch-millisecond claims issued now and expiring after the current instant', async () => {
    const setup = configuredDelegation({ claimsPatch: { issuedAtMs: Date.parse('2026-01-01T00:30:00.000Z'), expiresAtMs: Date.parse('2026-01-01T00:30:00.001Z') } })
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run(serialized, { queue: 'critical' })).resolves.toBeUndefined()
  })

  it.each([
    ['audience', { audience: 'other-workers' }],
    ['issuer', { issuer: 'unknown-issuer' }],
    ['queue', { queue: 'other' }],
    ['serialized job', { serializedJobName: PublicJob.jobName }],
    ['canonical job', { canonicalJobName: PublicJob.jobName }],
    ['dispatch id', { dispatch: { version: 1, id: 'other-dispatch', payloadFingerprint: `sha256:${'a'.repeat(64)}` } }],
    ['payload fingerprint', { dispatch: { version: 1, id: 'dispatch-1', payloadFingerprint: `sha256:${'b'.repeat(64)}` } }],
    ['issuer time', { issuedAtMs: Date.parse('2026-01-02T00:00:00.000Z') }],
    ['expiration', { expiresAtMs: Date.parse('2025-12-31T23:59:59.000Z') }],
    ['exact expiration boundary', { expiresAtMs: Date.parse('2026-01-01T00:30:00.000Z') }],
    ['epoch-second timestamps', { issuedAtMs: 1_767_225_600, expiresAtMs: 1_767_229_200 }],
    ['unexpected claim', { unexpected: true }],
  ])('terminally denies a delegation with mismatched %s', async (_label, patch) => {
    const setup = configuredDelegation({ claimsPatch: patch })
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    const error = await setup.runner.run(serialized, { queue: 'critical' }).catch(value => value)

    expect(error).toMatchObject({ name: 'NonRetryableJobError', code: 'QUEUE_DELEGATION_DENIED', message: 'Queue delegation is not authorized.' })
    expect(error.cause).toBeUndefined()
    expect(setup.authenticate).not.toHaveBeenCalled()
  })

  it.each([
    ['actor', trustQueuePrincipal({ id: 'current-user-1' }, { actor: { type: 'user', id: 'other-user' }, tenantId: 'tenant-1' })],
    ['tenant', trustQueuePrincipal({ id: 'current-user-1' }, { actor: { type: 'user', id: 'user-1' }, tenantId: 'other-tenant' })],
    ['ordinary principal', { id: 'forged' }],
    ['missing principal', null],
  ])('terminally denies an authenticator with mismatched %s', async (_label, resolution) => {
    const setup = configuredDelegation({ authenticate: vi.fn(async () => resolution as never) })
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run(serialized, { queue: 'critical' })).rejects.toMatchObject({ code: 'QUEUE_DELEGATION_DENIED' })
  })

  it('denies missing, malformed, and invalid credentials without exposing details', async () => {
    const setup = configuredDelegation()
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)
    const metadata = serialized.version === 2 ? serialized.metadata : {}
    const { [QUEUE_DELEGATION_METADATA_KEY]: _credential, ...metadataWithoutCredential } = metadata
    const missing = { ...serialized, metadata: metadataWithoutCredential }
    const malformed = { ...serialized, metadata: { ...(serialized.version === 2 ? serialized.metadata : {}), [QUEUE_DELEGATION_METADATA_KEY]: { version: 1, credential: 'contains whitespace' } } }
    setup.verify.mockResolvedValueOnce(null)

    for (const candidate of [missing, malformed, serialized]) {
      const error = await setup.runner.run(candidate, { queue: 'critical' }).catch(value => value)
      expect(error).toMatchObject({ code: 'QUEUE_DELEGATION_DENIED', message: 'Queue delegation is not authorized.' })
      expect(JSON.stringify(error)).not.toContain('credential')
    }
  })

  it.each(['verifier', 'authenticator'])('keeps %s outages retryable and sanitized', async (boundary) => {
    const outage = new Error('secret identity store connection')
    const setup = configuredDelegation(boundary === 'verifier'
      ? { verify: vi.fn(async () => { throw outage }) }
      : { authenticate: vi.fn(async () => { throw outage }) })
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    const error = await setup.runner.run(serialized, { queue: 'critical' }).catch(value => value)

    expect(error).toBeInstanceOf(QueueDelegationUnavailableError)
    expect(error).toMatchObject({ message: 'Queue delegation is temporarily unavailable.', cause: outage })
    expect(error.message).not.toContain('secret')
  })

  it.each(['verifier', 'authenticator'])('lets %s adapters classify cryptographic or store denial as terminal', async (boundary) => {
    const setup = configuredDelegation(boundary === 'verifier'
      ? { verify: vi.fn(async () => { throw new QueueDelegationDeniedError() }) }
      : { authenticate: vi.fn(async () => { throw new QueueDelegationDeniedError() }) })
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run(serialized, { queue: 'critical' })).rejects.toMatchObject({ code: 'QUEUE_DELEGATION_DENIED' })
  })

  it('uses the worker descriptor queue rather than serialized context or claims', async () => {
    const setup = configuredDelegation()
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run(serialized, { queue: 'forged-route' })).rejects.toMatchObject({ code: 'QUEUE_DELEGATION_DENIED' })
  })

  it('binds the exact serialized alias as well as the canonical job name', async () => {
    const setup = configuredDelegation()
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run({ ...serialized, name: DelegatedJob.name }, { queue: 'critical' })).rejects.toMatchObject({ code: 'QUEUE_DELEGATION_DENIED' })
  })

  it('rejects payload corruption before invoking the delegation verifier', async () => {
    const setup = configuredDelegation()
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run({ ...serialized, payload: { invoiceId: 'forged' } }, { queue: 'critical' })).rejects.toMatchObject({ code: 'INVALID_JOB_DISPATCH' })
    expect(setup.verify).not.toHaveBeenCalled()
  })

  it('requires an actual queue descriptor for delegated execution', async () => {
    const setup = configuredDelegation()
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await expect(setup.runner.run(serialized)).rejects.toMatchObject({ code: 'QUEUE_DELEGATION_MISCONFIGURED' })
    expect(setup.verify).not.toHaveBeenCalled()
  })

  it('reloads current delegation state and denies a later revoked attempt', async () => {
    let active = true
    const authenticate: QueueDelegationAuthenticator['authenticate'] = async () => active
      ? trustQueuePrincipal({ id: 'current-user-1' }, { actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' })
      : null
    const setup = configuredDelegation({ authenticate })
    const serialized = setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)

    await setup.runner.run(serialized, { queue: 'critical', attempt: 1 })
    active = false
    await expect(setup.runner.run(serialized, { queue: 'critical', attempt: 2 })).rejects.toMatchObject({ code: 'QUEUE_DELEGATION_DENIED' })
    expect(setup.authenticate).toHaveBeenCalledTimes(2)
  })

  it('applies issuance and verification only to selected canonical jobs and aliases', async () => {
    const setup = configuredDelegation({ jobs: [DelegatedJob.name] })
    const publicSerialized = setup.runner.serialize(new PublicJob(), 'public', setup.serializer)

    await setup.runner.run(publicSerialized, { queue: 'public' })

    expect(setup.issue).not.toHaveBeenCalled()
    expect(setup.verify).not.toHaveBeenCalled()
    expect(publicSerialized.version === 2 ? publicSerialized.metadata[QUEUE_DELEGATION_METADATA_KEY] : undefined).toBeUndefined()
  })

  it('rejects unsafe installation and credential output at dispatch time', () => {
    expect(() => configuredDelegation({ audience: '' })).toThrow('audience')
    expect(() => configuredDelegation({ issuers: [] })).toThrow('between 1 and 64')
    expect(() => configuredDelegation({ jobs: [] })).toThrow('between 1 and 256')
    expect(() => configuredDelegation({ jobs: ['not.registered'] })).toThrow('not registered')

    const setup = configuredDelegation({ issue: vi.fn(() => 'contains whitespace') })
    expect(() => setup.runner.serialize(new DelegatedJob(), 'critical', setup.serializer)).toThrow('credential')
  })
})

interface SetupOptions {
  readonly audience?: string
  readonly issuers?: readonly string[]
  readonly jobs?: readonly string[]
  readonly registry?: AuthorizationRegistry
  readonly issue?: QueueDelegationIssuer['issue']
  readonly verify?: QueueDelegationVerifier['verify']
  readonly authenticate?: QueueDelegationAuthenticator['authenticate']
  readonly claimsPatch?: Record<string, unknown>
  readonly captureAuthorizationEarly?: boolean
}

function configuredDelegation(options: SetupOptions = {}) {
  const root = createContainer()
  const authorizationRegistry = options.registry ?? new AuthorizationRegistry().registerAbility('queue.invoice.process', () => true)
  root.instance(authorizationRegistryToken, authorizationRegistry)
  root.instance(principalResolverToken, { resolve: () => null })
  root.scoped(authorizationToken, resolver => new Authorization(authorizationRegistry, () => resolver.make(executionContextToken), () => resolver.make(principalResolverToken)))
  const execution = producerContext()
  root.instance(executionContextToken, execution)

  const jobs = new InMemoryJobRegistry()
  jobs.register(DelegatedJob.jobName, DelegatedJob)
  jobs.register(PublicJob.jobName, PublicJob)
  const runner = new JobRunner(root, jobs)
  runner.contributeScope((_serialized, scope) => scope.override(executionContextToken, ExecutionContext.create({
    source: { type: 'queue', name: DelegatedJob.jobName },
    executionId: 'worker-execution',
    correlationId: 'producer-correlation',
    actor: { type: 'user', id: 'untrusted-producer' },
    tenantId: 'untrusted-tenant',
    startedAt: '2026-01-01T00:00:00.000Z',
  })))
  let capturedAuthorization: Authorization | undefined
  if (options.captureAuthorizationEarly) {
    runner.contributeScope((_serialized, scope) => {
      capturedAuthorization = scope.make(authorizationToken)
    })
  }
  const admission = new JobAdmissionMetadataContributorRegistry()
  const issue = vi.fn(options.issue ?? (() => 'signed.credential'))
  let issued: QueueDelegationIssueContext | undefined
  const issuing = vi.fn((context: QueueDelegationIssueContext) => {
    issued = context
    return issue(context)
  })
  const claims = (): QueueDelegationClaimsV1 => {
    if (!issued) throw new Error('Credential was not issued')
    return {
      version: 1,
      issuer: 'identity.internal',
      keyId: 'key-1',
      audience: issued.audience,
      credentialId: 'delegation-1',
      delegationId: 'delegation-record-1',
      actor: { type: 'user', id: 'user-1' },
      tenantId: 'tenant-1',
      queue: issued.admission.queue,
      serializedJobName: issued.admission.serializedJobName,
      canonicalJobName: issued.admission.canonicalJobName,
      dispatch: issued.admission.dispatch,
      issuedAtMs: Date.parse('2026-01-01T00:00:00.000Z'),
      expiresAtMs: Date.parse('2026-01-01T01:00:00.000Z'),
      ...options.claimsPatch,
    } as QueueDelegationClaimsV1
  }
  const verify = vi.fn(options.verify ?? (async () => claims()))
  const authenticate = vi.fn(options.authenticate ?? (async () => trustQueuePrincipal({ id: 'current-user-1' }, { actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' })))
  installQueueDelegation(admission, runner, {
    audience: options.audience ?? 'workers.internal',
    issuers: options.issuers ?? ['identity.internal'],
    ...(options.jobs ? { jobs: options.jobs } : {}),
    issuer: { issue: issuing },
    verifier: { verify },
    authenticator: { authenticate },
    now: () => new Date('2026-01-01T00:30:00.000Z'),
  })
  const serializer = new JobSerializer(new JobMetadataContributorRegistry(), root, () => 'dispatch-1', admission)
  return { root, runner, serializer, issue, verify, authenticate, capturedAuthorization: () => capturedAuthorization }
}
