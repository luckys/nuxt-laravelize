/* eslint-disable @stylistic/max-statements-per-line, no-empty */
import type { Container } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import type { Observability, PropagationCarrier } from '@nuxt-laravelize/observability/runtime'
import { safeErrorType, sanitizeCarrier } from '@nuxt-laravelize/observability/runtime'
import { isJobReleasedError, type JobExecutionDescriptor, type JobMetadataContributorRegistry, type JobRunner, type SerializedJob } from '@nuxt-laravelize/queue/runtime'

const KEY = 'laravelize.trace.v1'
const INSTALLATION = 'laravelize.observability.queue'
export interface QueueObservabilityOptions { readonly jobs: readonly string[], readonly queues: readonly string[], readonly trustTraceContext?: boolean, readonly propagateTracestate?: boolean }
export function installQueueObservability(contributors: JobMetadataContributorRegistry, runner: JobRunner, observability: Observability, options: QueueObservabilityOptions): void {
  if (runner.hasMiddleware(INSTALLATION)) return
  const jobs = new Set(options.jobs)
  const queues = new Set(options.queues)
  contributors.contribute(INSTALLATION, () => {
    try {
      const carrier = sanitizeCarrier(observability.inject())
      return carrier.traceparent ? { [KEY]: { traceparent: carrier.traceparent, ...(options.propagateTracestate && carrier.tracestate ? { tracestate: carrier.tracestate } : {}) } } : undefined
    }
    catch { return undefined }
  })
  runner.use(INSTALLATION, async (serialized, scope, next, descriptor) => consume(observability, serialized, scope, next, descriptor, jobs, queues, options), -100)
}
async function consume(observability: Observability, serialized: SerializedJob, scope: Container, next: () => Promise<void>, descriptor: JobExecutionDescriptor | undefined, jobs: Set<string>, queues: Set<string>, options: QueueObservabilityOptions): Promise<void> {
  if (descriptor?.phase === 'failed') { await next(); return }
  const job = jobs.has(serialized.name) ? serialized.name : 'other'
  const queue = descriptor?.queue && queues.has(descriptor.queue) ? descriptor.queue : 'other'
  const attributes = { 'messaging.operation.name': descriptor?.phase ?? 'process', 'messaging.destination.name': queue, 'messaging.job.name': job, 'messaging.retry.attempt': descriptor?.attempt ?? 1 }
  const parent = queueTraceMetadata(serialized)
  let span
  try { span = observability.startSpan('queue.process', { kind: 'consumer', attributes, ...(options.trustTraceContext && parent.traceparent ? { parent } : { root: true }) }) }
  catch { await next(); return }
  const started = performance.now()
  let ended = false
  let result = 'completed'
  try {
    let invoked = false
    let execution: Promise<void> | undefined
    const operation = async () => {
      if (invoked) return execution
      invoked = true
      execution = (async () => {
        if (span.traceId && span.spanId) {
          const current = scope.has(executionContextToken) ? scope.make(executionContextToken) : undefined
          try { scope.override(executionContextToken, current ? current.withTrace(span.traceId, span.spanId) : ExecutionContext.create({ source: { type: 'queue', name: job }, traceId: span.traceId, spanId: span.spanId })) }
          catch { /* Execution-context synchronization is optional instrumentation. */ }
        }
        try {
          await next(); try { span.setStatus('ok') }
          catch {}
        }
        catch (error) {
          if (isJobReleasedError(error)) {
            result = 'released'; try { span.setStatus('ok') }
            catch {}
          }
          else {
            result = 'failed'; try { span.recordErrorType(safeErrorType(error)) }
            catch {}; try { span.setStatus('error') }
            catch {}
          }
          throw error
        }
      })()
      return execution
    }
    try { await observability.withSpan(span, operation) }
    catch (activationError) {
      if (invoked) await execution
      else await operation()
      void activationError
    }
  }
  finally {
    let counter
    try { counter = observability.counter('queue.process.jobs') }
    catch {}
    try { counter?.add(1, { queue, job, result }) }
    catch {}
    let histogram
    try { histogram = observability.histogram('queue.process.duration') }
    catch {}
    try { histogram?.record(performance.now() - started, { queue, job }) }
    catch {}
    if (!ended) {
      ended = true; try { span.end() }
      catch {}
    }
  }
}
export function queueTraceMetadata(serialized: SerializedJob): PropagationCarrier {
  try {
    if (!serialized || serialized.version !== 2) return {}
    const metadata = serialized.metadata
    if (!metadata || Object.getPrototypeOf(metadata) !== Object.prototype || Object.keys(metadata).length > 64) return {}
    return sanitizeCarrier(metadata[KEY])
  }
  catch { return {} }
}
