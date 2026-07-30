import { Authorization, authorizationRegistryToken, authorizationToken, principalResolverToken, resolveTrustedQueueContext, type PrincipalResolver, type TrustedQueuePrincipalResolution } from '@nuxt-laravelize/authorization/runtime'
import type { Container } from '@nuxt-laravelize/core/runtime'
import { executionContextToken, type Actor, type ExecutionContextSnapshot } from '@nuxt-laravelize/execution-context/runtime'
import { NonRetryableJobError, readJobDispatchIdentity, type JobAdmissionContextV1, type JobAdmissionMetadataContributorRegistry, type JobDispatchIdentityV1, type JobRunner, type SerializedJob } from '@nuxt-laravelize/queue/runtime'

export const QUEUE_DELEGATION_METADATA_KEY = 'laravelize.authorization.queue-delegation.v1'
export const MAX_QUEUE_DELEGATION_CREDENTIAL_LENGTH = 8_192

const INSTALLATION_ID = 'laravelize.authorization.queue-delegation'
const IDENTIFIER = /^\w[\w.:-]{0,127}$/
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/
const installations = new WeakMap<JobAdmissionMetadataContributorRegistry, JobRunner>()

export interface QueueDelegationIssueContext {
  readonly version: 1
  readonly audience: string
  readonly admission: JobAdmissionContextV1
  readonly context?: ExecutionContextSnapshot
}

export interface QueueDelegationClaimsV1 {
  readonly version: 1
  readonly issuer: string
  readonly keyId: string
  readonly audience: string
  readonly credentialId: string
  readonly delegationId: string
  readonly actor: Actor
  readonly tenantId?: string
  readonly queue: string
  readonly serializedJobName: string
  readonly canonicalJobName: string
  readonly dispatch: JobDispatchIdentityV1
  readonly issuedAtMs: number
  readonly expiresAtMs: number
}

export interface QueueDelegationExpectedV1 {
  readonly version: 1
  readonly audience: string
  readonly queue: string
  readonly serializedJobName: string
  readonly canonicalJobName: string
  readonly dispatch: JobDispatchIdentityV1
}

export interface QueueDelegationIssuer {
  issue(context: QueueDelegationIssueContext): string
}

export interface QueueDelegationVerifier {
  verify(credential: string, expected: QueueDelegationExpectedV1): QueueDelegationClaimsV1 | null | Promise<QueueDelegationClaimsV1 | null>
}

export interface QueueDelegationAuthenticator<Principal = unknown> {
  authenticate(claims: QueueDelegationClaimsV1, scope: Container): TrustedQueuePrincipalResolution<Principal> | null | undefined | Promise<TrustedQueuePrincipalResolution<Principal> | null | undefined>
}

export interface QueueDelegationOptions {
  readonly audience: string
  readonly issuers: readonly string[]
  readonly issuer: QueueDelegationIssuer
  readonly verifier: QueueDelegationVerifier
  readonly authenticator: QueueDelegationAuthenticator
  readonly jobs?: readonly string[]
  readonly now?: () => Date
  readonly clockSkewMs?: number
}

export class QueueDelegationUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Queue delegation is temporarily unavailable.', { cause })
    this.name = 'QueueDelegationUnavailableError'
  }
}

export class QueueDelegationDeniedError extends Error {
  constructor() {
    super('Queue delegation credential was denied.')
    this.name = 'QueueDelegationDeniedError'
  }
}

export function installQueueDelegation(contributors: JobAdmissionMetadataContributorRegistry, runner: JobRunner, options: QueueDelegationOptions): void {
  if (installations.has(contributors)) throw new TypeError('Queue delegation is already installed for these contributors')
  const audience = boundedText(options.audience, 'audience')
  const issuers = boundedUniqueTexts(options.issuers, 'issuers')
  if (!options.issuer || typeof options.issuer.issue !== 'function') throw new TypeError('Queue delegation issuer is required')
  if (!options.verifier || typeof options.verifier.verify !== 'function') throw new TypeError('Queue delegation verifier is required')
  if (!options.authenticator || typeof options.authenticator.authenticate !== 'function') throw new TypeError('Queue delegation authenticator is required')
  const issuer = options.issuer
  const verifier = options.verifier
  const authenticator = options.authenticator
  const selected = options.jobs === undefined ? undefined : selectedJobs(runner, options.jobs)
  const now = options.now ?? (() => new Date())
  const clockSkewMs = integer(options.clockSkewMs ?? 0, 'clockSkewMs', 0, 300_000)
  contributors.contribute(INSTALLATION_ID, (_job, admission, resolver) => {
    if (selected && !selected.has(admission.canonicalJobName)) return undefined
    const context = resolver?.has(executionContextToken) ? immutableContext(resolver.make(executionContextToken).snapshot()) : undefined
    const issueContext = Object.freeze({ version: 1 as const, audience, admission, ...(context ? { context } : {}) })
    const credential = credentialValue(issuer.issue(issueContext))
    return { [QUEUE_DELEGATION_METADATA_KEY]: Object.freeze({ version: 1, credential }) }
  })

  runner.contributeScope(async (serialized, scope, descriptor) => {
    const canonicalJobName = runner.canonicalJobName(serialized.name)
    if (!canonicalJobName) throw misconfigured()
    if (selected && !selected.has(canonicalJobName)) return
    if (descriptor?.runner !== runner || !descriptor.queue) throw misconfigured()
    const dispatch = readJobDispatchIdentity(serialized)
    if (!dispatch) throw denied()
    let queue: string
    try {
      queue = boundedText(descriptor.queue, 'queue')
    }
    catch { throw misconfigured() }
    const expected = Object.freeze({ version: 1 as const, audience, queue, serializedJobName: serialized.name, canonicalJobName, dispatch })
    const credential = readCredential(serialized)
    let claims: QueueDelegationClaimsV1 | null
    try {
      claims = await verifier.verify(credential, expected)
    }
    catch (error) {
      if (error instanceof QueueDelegationDeniedError) throw denied()
      throw new QueueDelegationUnavailableError(error)
    }
    const trustedClaims = normalizeClaims(claims)
    let matches: boolean
    try {
      matches = matchesExpected(trustedClaims, expected, now(), clockSkewMs)
    }
    catch { throw misconfigured() }
    if (!issuers.has(trustedClaims.issuer) || !matches) throw denied()
    let resolution: Awaited<ReturnType<QueueDelegationAuthenticator['authenticate']>>
    try {
      resolution = await authenticator.authenticate(trustedClaims, scope)
    }
    catch (error) {
      if (error instanceof QueueDelegationDeniedError) throw denied()
      throw new QueueDelegationUnavailableError(error)
    }
    let identity: ReturnType<typeof resolveTrustedQueueContext>
    try {
      identity = resolveTrustedQueueContext(resolution)
    }
    catch { throw denied() }
    if (!identity || !sameActor(identity.actor, trustedClaims.actor) || identity.tenantId !== trustedClaims.tenantId) throw denied()
    if (!scope.has(authorizationRegistryToken)) throw misconfigured()
    const principalResolver: PrincipalResolver = { resolve: () => resolution }
    scope.override(principalResolverToken, principalResolver)
    const registry = scope.make(authorizationRegistryToken)
    scope.override(authorizationToken, new Authorization(registry, () => scope.make(executionContextToken), () => scope.make(principalResolverToken)))
  })
  installations.set(contributors, runner)
}

function readCredential(serialized: SerializedJob): string {
  try {
    if (serialized.version !== 2) throw new TypeError('Missing metadata')
    const descriptor = Object.getOwnPropertyDescriptor(serialized.metadata, QUEUE_DELEGATION_METADATA_KEY)
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Missing credential')
    const envelope = descriptor.value
    if (!envelope || typeof envelope !== 'object' || Object.getPrototypeOf(envelope) !== Object.prototype || Reflect.ownKeys(envelope).length !== 2) throw new TypeError('Invalid credential')
    const version = Object.getOwnPropertyDescriptor(envelope, 'version')
    const credential = Object.getOwnPropertyDescriptor(envelope, 'credential')
    if (!data(version) || version.value !== 1 || !data(credential)) throw new TypeError('Invalid credential')
    return credentialValue(credential.value)
  }
  catch { throw denied() }
}

function normalizeClaims(value: QueueDelegationClaimsV1 | null): QueueDelegationClaimsV1 {
  try {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid claims')
    const required = ['version', 'issuer', 'keyId', 'audience', 'credentialId', 'delegationId', 'actor', 'queue', 'serializedJobName', 'canonicalJobName', 'dispatch', 'issuedAtMs', 'expiresAtMs']
    const allowed = new Set([...required, 'tenantId'])
    const keys = Reflect.ownKeys(value)
    if (keys.length !== required.length + (Object.prototype.hasOwnProperty.call(value, 'tenantId') ? 1 : 0) || keys.some(key => typeof key !== 'string' || !allowed.has(key))) throw new TypeError('Invalid claims')
    for (const key of required) if (!data(Object.getOwnPropertyDescriptor(value, key))) throw new TypeError('Invalid claims')
    const actor = normalizeActor(value.actor)
    const dispatch = normalizeDispatch(value.dispatch)
    const tenant = Object.getOwnPropertyDescriptor(value, 'tenantId')
    if (tenant && !data(tenant)) throw new TypeError('Invalid claims')
    const tenantId = tenant ? identifier(tenant.value, 'tenantId') : undefined
    if (value.version !== 1 || !Number.isSafeInteger(value.issuedAtMs) || !Number.isSafeInteger(value.expiresAtMs) || value.expiresAtMs <= value.issuedAtMs) throw new TypeError('Invalid claims')
    return Object.freeze({
      version: 1,
      issuer: boundedText(value.issuer, 'issuer'),
      keyId: identifier(value.keyId, 'keyId'),
      audience: boundedText(value.audience, 'audience'),
      credentialId: identifier(value.credentialId, 'credentialId'),
      delegationId: identifier(value.delegationId, 'delegationId'),
      actor,
      ...(tenantId ? { tenantId } : {}),
      queue: boundedText(value.queue, 'queue'),
      serializedJobName: boundedText(value.serializedJobName, 'serializedJobName'),
      canonicalJobName: boundedText(value.canonicalJobName, 'canonicalJobName'),
      dispatch,
      issuedAtMs: value.issuedAtMs,
      expiresAtMs: value.expiresAtMs,
    })
  }
  catch { throw denied() }
}

function matchesExpected(claims: QueueDelegationClaimsV1, expected: QueueDelegationExpectedV1, now: Date, clockSkewMs: number): boolean {
  const current = now.getTime()
  if (!Number.isFinite(current)) throw new TypeError('Queue delegation clock returned an invalid date')
  return claims.audience === expected.audience
    && claims.queue === expected.queue
    && claims.serializedJobName === expected.serializedJobName
    && claims.canonicalJobName === expected.canonicalJobName
    && claims.dispatch.id === expected.dispatch.id
    && claims.dispatch.payloadFingerprint === expected.dispatch.payloadFingerprint
    && claims.issuedAtMs <= current + clockSkewMs
    && claims.expiresAtMs > current - clockSkewMs
}

function normalizeActor(value: unknown): Actor {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 2) throw new TypeError('Invalid actor')
  const actor = value as Record<string, unknown>
  if (!data(Object.getOwnPropertyDescriptor(actor, 'type')) || !data(Object.getOwnPropertyDescriptor(actor, 'id')) || !['user', 'service', 'system'].includes(String(actor.type))) throw new TypeError('Invalid actor')
  return Object.freeze({ type: actor.type as Actor['type'], id: identifier(actor.id, 'actor.id') })
}

function normalizeDispatch(value: unknown): JobDispatchIdentityV1 {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 3) throw new TypeError('Invalid dispatch')
  const dispatch = value as Record<string, unknown>
  if (!data(Object.getOwnPropertyDescriptor(dispatch, 'version')) || dispatch.version !== 1 || !data(Object.getOwnPropertyDescriptor(dispatch, 'id')) || !data(Object.getOwnPropertyDescriptor(dispatch, 'payloadFingerprint'))) throw new TypeError('Invalid dispatch')
  const id = identifier(dispatch.id, 'dispatch.id')
  if (typeof dispatch.payloadFingerprint !== 'string' || !FINGERPRINT.test(dispatch.payloadFingerprint)) throw new TypeError('Invalid dispatch')
  return Object.freeze({ version: 1, id, payloadFingerprint: dispatch.payloadFingerprint as `sha256:${string}` })
}

function selectedJobs(runner: JobRunner, values: readonly string[]): ReadonlySet<string> {
  if (!Array.isArray(values) || values.length === 0 || values.length > 256) throw new TypeError('Queue delegation job selection must contain between 1 and 256 names')
  const selected = new Set<string>()
  for (const value of values) {
    const canonical = typeof value === 'string' ? runner.canonicalJobName(value) : undefined
    if (!canonical) throw new TypeError('Queue delegation job name is not registered')
    if (selected.has(canonical)) throw new TypeError('Duplicate queue delegation job name')
    selected.add(canonical)
  }
  return selected
}

function immutableContext(context: ExecutionContextSnapshot): ExecutionContextSnapshot {
  return Object.freeze({
    ...context,
    source: Object.freeze({ ...context.source }),
    ...(context.actor ? { actor: Object.freeze({ ...context.actor }) } : {}),
    ...(context.attributes ? { attributes: Object.freeze({ ...context.attributes }) } : {}),
  })
}

function credentialValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_QUEUE_DELEGATION_CREDENTIAL_LENGTH || !/^[\x21-\x7E]+$/.test(value)) throw new TypeError('Invalid queue delegation credential')
  return value
}

function boundedText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\r\n\0]/.test(value)) throw new TypeError(`Invalid queue delegation ${field}`)
  return value
}

function boundedUniqueTexts(values: readonly string[], field: string): ReadonlySet<string> {
  if (!Array.isArray(values) || values.length < 1 || values.length > 64) throw new TypeError(`Queue delegation ${field} must contain between 1 and 64 values`)
  const result = new Set<string>()
  for (const value of values) {
    const normalized = boundedText(value, field)
    if (result.has(normalized)) throw new TypeError(`Duplicate queue delegation ${field}`)
    result.add(normalized)
  }
  return result
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new TypeError(`Invalid queue delegation ${field}`)
  return value
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError(`Queue delegation ${field} must be an integer between ${minimum} and ${maximum}`)
  return value as number
}

function sameActor(left: Actor, right: Actor): boolean {
  return left.type === right.type && left.id === right.id
}
const data = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => Boolean(descriptor && 'value' in descriptor && descriptor.enumerable)
const denied = () => new NonRetryableJobError('QUEUE_DELEGATION_DENIED', 'Queue delegation is not authorized.')
const misconfigured = () => new NonRetryableJobError('QUEUE_DELEGATION_MISCONFIGURED', 'Queue delegation is not configured correctly.')
