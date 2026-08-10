import { AbilityNotDefinedError, AuthorizationDeniedError, authorizationRegistryToken, authorizationToken, type AuthorizationRegistry } from '@luckys_luis/nuxt-laravelize-authorization/runtime'
import type { Container } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { isNonRetryableJobError, NonRetryableJobError, type JobExecutionDescriptor, type JobExecutionMiddleware, type JobRunner, type SerializedJob } from '@luckys_luis/nuxt-laravelize-queue/runtime'

export interface QueueAuthorizationResource {
  readonly resourceType: string
  readonly resolve: (job: SerializedJob, scope: Container, descriptor?: JobExecutionDescriptor) => unknown | Promise<unknown>
}

export interface RequireAuthorizationOptions {
  readonly ability: string
  readonly jobs?: readonly string[]
  readonly resource?: QueueAuthorizationResource
}

export class QueueAuthorizationUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Queue authorization is temporarily unavailable.', { cause })
    this.name = 'QueueAuthorizationUnavailableError'
  }
}

export class RequireAuthorization {
  readonly handle: JobExecutionMiddleware

  constructor(registry: AuthorizationRegistry, runner: JobRunner, options: RequireAuthorizationOptions) {
    const ability = options.ability
    let resource: QueueAuthorizationResource | undefined
    if (options.resource) {
      if (typeof options.resource.resourceType !== 'string' || typeof options.resource.resolve !== 'function') throw new TypeError('Queue authorization resource configuration is invalid')
      if (typeof registry.policy(options.resource.resourceType)?.[ability] !== 'function') throw new AbilityNotDefinedError(ability)
      resource = Object.freeze({ resourceType: options.resource.resourceType, resolve: options.resource.resolve })
    }
    else if (!registry.ability(ability)) throw new AbilityNotDefinedError(ability)
    const jobs = options.jobs === undefined ? undefined : selectedJobs(runner, options.jobs)

    this.handle = async (job, scope, next, descriptor) => {
      if (descriptor?.runner && descriptor.runner !== runner) throw misconfigured()
      if (!scope.has(authorizationRegistryToken) || !scope.has(authorizationToken) || scope.make(authorizationRegistryToken) !== registry) throw misconfigured()
      const authorization = scope.make(authorizationToken)
      if (!authorization.usesRegistry(registry)) throw misconfigured()
      const canonicalName = runner.canonicalJobName(job.name)
      if (!canonicalName) throw misconfigured()
      if (jobs && !jobs.has(canonicalName)) {
        await next()
        return
      }
      if (!scope.has(executionContextToken) || scope.make(executionContextToken).snapshot().source.type !== 'queue') throw denied()
      try {
        const resolvedResource = resource ? await resource.resolve(job, scope, descriptor) : undefined
        if (resource && resolvedResource == null) throw denied()
        await authorization.authorize(ability, resource ? { resourceType: resource.resourceType, resource: resolvedResource } : undefined)
      }
      catch (error) {
        if (error instanceof AuthorizationDeniedError) throw denied()
        if (error instanceof AbilityNotDefinedError) throw misconfigured()
        if (isNonRetryableJobError(error)) throw error
        throw new QueueAuthorizationUnavailableError(error)
      }
      await next()
    }
  }
}

function selectedJobs(runner: JobRunner, values: readonly string[]): ReadonlySet<string> {
  if (!Array.isArray(values) || values.length === 0 || values.length > 256) throw new TypeError('Authorization job selection must contain between 1 and 256 names')
  const jobs = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\r\n\0]/.test(value)) throw new TypeError('Invalid authorization job name')
    const canonical = runner.canonicalJobName(value)
    if (!canonical) throw new TypeError('Authorization job name is not registered')
    if (jobs.has(canonical)) throw new TypeError('Duplicate authorization job name')
    jobs.add(canonical)
  }
  return jobs
}

const denied = () => new NonRetryableJobError('QUEUE_AUTHORIZATION_DENIED', 'Queue execution is not authorized.')
const misconfigured = () => new NonRetryableJobError('QUEUE_AUTHORIZATION_MISCONFIGURED', 'Queue authorization is not configured correctly.')
