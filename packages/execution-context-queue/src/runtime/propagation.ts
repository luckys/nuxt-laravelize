import { ExecutionContext, executionContextToken, type ExecutionContextSnapshot, type IdFactory } from '@nuxt-laravelize/execution-context/runtime'
import { runWithExecutionContext, type currentExecutionContextOptional as Current } from '@nuxt-laravelize/execution-context/runtime/server'
import { NonRetryableJobError, type JobMetadataContributorRegistry, type JobRunner, type SerializedJob } from '@nuxt-laravelize/queue/runtime'

export const EXECUTION_CONTEXT_METADATA_KEY = 'laravelize.execution-context.v1'
const installations = new WeakMap<JobMetadataContributorRegistry, WeakSet<JobRunner>>()
export function installExecutionContextQueuePropagation(contributors: JobMetadataContributorRegistry, runner: JobRunner, current: typeof Current, idFactory?: IdFactory): void {
  const runners = installations.get(contributors) ?? new WeakSet<JobRunner>()
  if (runners.has(runner)) return
  runners.add(runner)
  installations.set(contributors, runners)
  contributors.contribute((_job, resolver) => {
    const context = resolver?.has(executionContextToken) ? resolver.make(executionContextToken) : current()
    return context ? { [EXECUTION_CONTEXT_METADATA_KEY]: context.snapshot() } : undefined
  })
  runner.contributeScope((serialized, scope) => {
    const snapshot = readSnapshot(serialized)
    if (!snapshot) return
    let parent: ExecutionContext
    try {
      parent = ExecutionContext.from(snapshot)
    }
    catch {
      throw new NonRetryableJobError('INVALID_EXECUTION_CONTEXT', 'Queue execution context metadata is invalid.')
    }
    scope.override(executionContextToken, parent.derive({ source: { type: 'queue', name: serialized.name } }, idFactory))
  })
  runner.use(async (_serialized, scope, next) => {
    if (!scope.has(executionContextToken)) return next()
    return runWithExecutionContext(scope.make(executionContextToken), next)
  })
}
function readSnapshot(serialized: SerializedJob): ExecutionContextSnapshot | undefined {
  if (serialized.version !== 2) return undefined
  if (!Object.prototype.hasOwnProperty.call(serialized.metadata, EXECUTION_CONTEXT_METADATA_KEY)) return undefined
  const value = serialized.metadata[EXECUTION_CONTEXT_METADATA_KEY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NonRetryableJobError('INVALID_EXECUTION_CONTEXT', 'Queue execution context metadata is invalid.')
  return value as ExecutionContextSnapshot
}
