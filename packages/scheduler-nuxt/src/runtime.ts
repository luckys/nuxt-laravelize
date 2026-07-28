import { isScheduledTaskDue, normalizeScheduledTask, type NormalizedScheduledTask, type QueueDispatchDescriptor, type ScheduledTask, type ScheduledTimestamp } from '@nuxt-laravelize/scheduler'

export interface SchedulerExecutionContext {
  readonly task: NormalizedScheduledTask
  readonly payload: Readonly<Record<string, unknown>>
  readonly scheduledTime: ScheduledTimestamp
  readonly signal: AbortSignal
  readonly fencingToken?: string
}

export interface ScheduledOperationHandler {
  execute(context: SchedulerExecutionContext): unknown | Promise<unknown>
}

export interface SchedulerQueueDispatcher {
  dispatch(descriptor: QueueDispatchDescriptor, context: SchedulerExecutionContext): unknown | Promise<unknown>
}

export interface SchedulerLockLease {
  release(): void | Promise<void>
  assertOwned?(): void | Promise<void>
  readonly signal?: AbortSignal
  readonly fencingToken?: string
}

export interface SchedulerOccurrenceClaim {
  /** Retain the completed occurrence marker until its configured TTL expires. */
  complete(): void | Promise<void>
  /** Owner-atomically release an incomplete occurrence so it can be retried. */
  release(): void | Promise<void>
}

export interface SchedulerLockProvider {
  readonly capabilities: { readonly distributed: boolean }
  acquire(key: string, expiresAfterSeconds: number): SchedulerLockLease | null | Promise<SchedulerLockLease | null>
  claim?(key: string, expiresAfterSeconds: number): SchedulerOccurrenceClaim | null | Promise<SchedulerOccurrenceClaim | null>
}

export interface SchedulerMaintenanceProvider { isActive(): boolean | Promise<boolean> }

export interface SchedulerHookContext extends SchedulerExecutionContext { readonly result?: unknown, readonly error?: unknown }
export type SchedulerHook = (context: SchedulerHookContext) => void | Promise<void>

export interface SchedulerRunnerOptions {
  readonly operations?: Readonly<Record<string, ScheduledOperationHandler>>
  readonly queue?: SchedulerQueueDispatcher
  readonly locks?: SchedulerLockProvider
  readonly maintenance?: SchedulerMaintenanceProvider
  readonly clock?: SchedulerClock
  readonly namespace?: string
  readonly occurrenceRetentionSeconds?: number
  readonly hooks?: {
    readonly success?: Readonly<Record<string, SchedulerHook>>
    readonly failure?: Readonly<Record<string, SchedulerHook>>
  }
}

export type SchedulerRunResult
  = | { readonly status: 'completed', readonly result: unknown }
    | { readonly status: 'skipped', readonly reason: 'maintenance' | 'locked' | 'timezone-not-due' | 'duplicate-minute' }

export class SchedulerLockCapabilityError extends Error {}
export class SchedulerLockLostError extends Error {}
export class SchedulerHandlerNotFoundError extends Error {}

export interface SchedulerRunner {
  run(task: ScheduledTask, payload?: Readonly<Record<string, unknown>>, options?: Readonly<{ scheduledTime?: ScheduledTimestamp }>): Promise<SchedulerRunResult>
}

export interface NitroTaskInvocation {
  readonly name: string
  readonly payload?: Readonly<Record<string, unknown>>
  readonly context?: Readonly<Record<string, unknown>>
  readonly scheduledTime?: ScheduledTimestamp
}

export interface SchedulerRuntimeScope {
  readonly runner: SchedulerRunner
  dispose?(): void | Promise<void>
}

export interface SchedulerRuntimeProvider {
  createScope(invocation: NitroTaskInvocation): SchedulerRuntimeScope | Promise<SchedulerRuntimeScope>
}

export type SchedulerClock = () => ScheduledTimestamp

export interface GeneratedSchedulerTaskOptions {
  readonly clock?: SchedulerClock
  readonly timestampSource?: 'wall-clock' | 'event'
}

export class ScheduledMinuteGuard {
  readonly #minutes = new Map<string, Readonly<{ minute: number, state: 'in-flight' | 'completed' }>>()

  check(task: ScheduledTask, timestamp: ScheduledTimestamp): 'timezone-not-due' | 'duplicate-minute' | undefined {
    const normalizedTask = normalizeScheduledTask(task)
    const instant = timestamp instanceof Date ? timestamp.getTime() : timestamp
    if (!Number.isFinite(instant)) throw new Error('Scheduled timestamp must be a valid Date or epoch millisecond value.')
    const minute = Math.floor(instant / 60_000) * 60_000
    if (normalizedTask.timezone && !isScheduledTaskDue(normalizedTask, instant)) return 'timezone-not-due'
    if (this.#minutes.get(normalizedTask.name)?.minute === minute) return 'duplicate-minute'
    this.#minutes.set(normalizedTask.name, { minute, state: 'in-flight' })
  }

  complete(task: ScheduledTask, timestamp: ScheduledTimestamp): void {
    const name = normalizeScheduledTask(task).name
    const minute = scheduledMinute(timestamp)
    if (this.#minutes.get(name)?.minute === minute) this.#minutes.set(name, { minute, state: 'completed' })
  }

  fail(task: ScheduledTask, timestamp: ScheduledTimestamp): void {
    const name = normalizeScheduledTask(task).name
    const minute = scheduledMinute(timestamp)
    const current = this.#minutes.get(name)
    if (current?.minute === minute && current.state === 'in-flight') this.#minutes.delete(name)
  }
}

export async function runScheduledTaskIfDue(
  task: ScheduledTask,
  runner: SchedulerRunner,
  timestamp: ScheduledTimestamp,
  guard: ScheduledMinuteGuard,
  payload: Readonly<Record<string, unknown>> = {},
): Promise<SchedulerRunResult> {
  const reason = guard.check(task, timestamp)
  if (reason) return { status: 'skipped', reason }
  try {
    const result = await runner.run(task, payload, { scheduledTime: timestamp })
    settleMinuteGuard(guard, task, timestamp, result)
    return result
  }
  catch (error) {
    guard.fail(task, timestamp)
    throw error
  }
}

export function createSchedulerRunner(options: SchedulerRunnerOptions): SchedulerRunner {
  const occurrenceRetentionSeconds = options.occurrenceRetentionSeconds ?? 24 * 60 * 60
  if (!Number.isSafeInteger(occurrenceRetentionSeconds) || occurrenceRetentionSeconds < 60 || occurrenceRetentionSeconds > 2_147_483_647) {
    throw new Error('Scheduler occurrence retention must be an integer between 60 and 2147483647 seconds.')
  }
  return {
    async run(task, payload = {}, execution = {}) {
      const normalizedTask = normalizeScheduledTask(task)
      const scheduledTime = execution.scheduledTime ?? options.clock?.() ?? Date.now()
      const minute = scheduledMinute(scheduledTime)
      if (normalizedTask.maintenance === 'skip' && await options.maintenance?.isActive()) return { status: 'skipped', reason: 'maintenance' }
      const locks = lockRequirements(normalizedTask, options.locks, options.namespace)
      const lease = locks.overlap ? await locks.overlap.provider.acquire(`scheduler:${locks.namespace}:overlap:${normalizedTask.name}`, locks.overlap.expiresAfterSeconds) : undefined
      if (locks.overlap && !lease) return { status: 'skipped', reason: 'locked' }
      let claim: SchedulerOccurrenceClaim | undefined
      try {
        claim = locks.election ? await locks.election.provider.claim!(`scheduler:${locks.namespace}:one-server:${normalizedTask.name}:${minute}`, occurrenceRetentionSeconds) ?? undefined : undefined
        if (locks.election && !claim) {
          await lease?.release()
          return { status: 'skipped', reason: 'locked' }
        }
      }
      catch (primaryError) {
        const relatedErrors: unknown[] = []
        try {
          await lease?.release()
        }
        catch (releaseError) { relatedErrors.push(releaseError) }
        throwPrimaryWithRelated(primaryError, relatedErrors)
      }
      const context = {
        task: normalizedTask,
        payload,
        scheduledTime,
        signal: lease?.signal ?? new AbortController().signal,
        ...(lease?.fencingToken ? { fencingToken: lease.fencingToken } : {}),
      }
      let result: unknown
      try {
        result = await execute(normalizedTask, context, options)
        await lease?.assertOwned?.()
        await invokeHook(normalizedTask.hooks?.success, options.hooks?.success, { ...context, result })
        await lease?.assertOwned?.()
        await claim?.complete()
      }
      catch (primaryError) {
        const relatedErrors: unknown[] = []
        try {
          await invokeHook(normalizedTask.hooks?.failure, options.hooks?.failure, { ...context, error: primaryError })
        }
        catch (hookError) { relatedErrors.push(hookError) }
        try {
          await claim?.release()
        }
        catch (releaseError) { relatedErrors.push(releaseError) }
        try {
          await lease?.release()
        }
        catch (releaseError) { relatedErrors.push(releaseError) }
        throwPrimaryWithRelated(primaryError, relatedErrors)
      }
      await lease?.release()
      return { status: 'completed', result }
    },
  }
}

export function createGeneratedSchedulerTask(task: ScheduledTask, provider: SchedulerRuntimeProvider, input: SchedulerClock | GeneratedSchedulerTaskOptions = {}) {
  const normalizedTask = normalizeScheduledTask(task)
  const guard = new ScheduledMinuteGuard()
  const options = typeof input === 'function' ? { clock: input } : input
  const clock = options.clock ?? Date.now
  return {
    meta: { name: normalizedTask.name, description: normalizedTask.description },
    async run(invocation: NitroTaskInvocation) {
      const { payload, scheduledTime: payloadScheduledTime } = splitNitroTaskPayload(invocation.payload)
      const eventScheduledTime = payloadScheduledTime ?? invocation.scheduledTime ?? readContextScheduledTime(invocation.context)
      const scheduledTime = options.timestampSource === 'event' ? eventScheduledTime ?? clock() : clock()
      const reason = guard.check(normalizedTask, scheduledTime)
      if (reason) return { result: { status: 'skipped' as const, reason } }
      try {
        const runtimeInvocation = { ...invocation, payload, scheduledTime }
        const scope = await provider.createScope(runtimeInvocation)
        if (!scope?.runner) throw new Error(`Scheduler runtime provider did not create a runner for task "${normalizedTask.name}".`)
        const result = await runWithCleanup(
          async () => {
            const runResult = await scope.runner.run(normalizedTask, payload, { scheduledTime })
            settleMinuteGuard(guard, normalizedTask, scheduledTime, runResult)
            return { result: runResult }
          },
          async () => scope.dispose?.(),
        )
        return result
      }
      catch (error) {
        guard.fail(normalizedTask, scheduledTime)
        throw error
      }
    },
  }
}

function splitNitroTaskPayload(input: Readonly<Record<string, unknown>> | undefined): { payload: Readonly<Record<string, unknown>>, scheduledTime?: ScheduledTimestamp } {
  const payload = { ...input }
  const scheduledTime = payload.scheduledTime
  if (scheduledTime instanceof Date || typeof scheduledTime === 'number') delete payload.scheduledTime
  return { payload: Object.freeze(payload), ...(scheduledTime instanceof Date || typeof scheduledTime === 'number' ? { scheduledTime } : {}) }
}

function readContextScheduledTime(context: Readonly<Record<string, unknown>> | undefined): ScheduledTimestamp | undefined {
  const value = context?.scheduledTime
  return value instanceof Date || typeof value === 'number' ? value : undefined
}

async function runWithCleanup<TResult>(work: () => Promise<TResult>, cleanup: () => void | Promise<void>): Promise<TResult> {
  let result: TResult
  try {
    result = await work()
  }
  catch (primaryError) {
    try {
      await cleanup()
    }
    catch (cleanupError) { throwPrimaryWithRelated(primaryError, [cleanupError]) }
    throw primaryError
  }
  await cleanup()
  return result
}

function throwPrimaryWithRelated(primaryError: unknown, relatedErrors: readonly unknown[]): never {
  if (relatedErrors.length === 0) throw primaryError
  throw new AggregateError([primaryError, ...relatedErrors], 'Scheduler execution failed and cleanup reported additional errors.', { cause: primaryError })
}

function lockRequirements(task: NormalizedScheduledTask, provider?: SchedulerLockProvider, configuredNamespace?: string): {
  readonly namespace: string
  readonly election?: { readonly provider: SchedulerLockProvider }
  readonly overlap?: { readonly provider: SchedulerLockProvider, readonly expiresAfterSeconds: number }
} {
  if (!task.oneServer && !task.overlap) return { namespace: '' }
  if (!provider) throw new SchedulerLockCapabilityError(`Scheduled task "${task.name}" requires a lock provider.`)
  const namespace = normalizeSchedulerNamespace(configuredNamespace)
  if (task.oneServer && !provider.capabilities.distributed) throw new SchedulerLockCapabilityError(`Scheduled task "${task.name}" requires a distributed lock provider for onOneServer.`)
  if (task.oneServer && !provider.claim) throw new SchedulerLockCapabilityError(`Scheduled task "${task.name}" requires an atomic occurrence-claim provider for onOneServer.`)
  return {
    namespace,
    ...(task.oneServer ? { election: { provider } } : {}),
    ...(task.overlap ? { overlap: { provider, expiresAfterSeconds: task.overlap.expiresAfterSeconds } } : {}),
  }
}

function normalizeSchedulerNamespace(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][\w.-]{0,127}$/i.test(value)) throw new SchedulerLockCapabilityError('Lock-backed scheduled tasks require a stable alphanumeric scheduler namespace.')
  return value
}

function scheduledMinute(timestamp: ScheduledTimestamp): number {
  const instant = timestamp instanceof Date ? timestamp.getTime() : timestamp
  if (!Number.isFinite(instant)) throw new Error('Scheduled timestamp must be a valid Date or epoch millisecond value.')
  return Math.floor(instant / 60_000) * 60_000
}

function settleMinuteGuard(guard: ScheduledMinuteGuard, task: ScheduledTask, timestamp: ScheduledTimestamp, result: SchedulerRunResult): void {
  if (result.status === 'skipped' && result.reason === 'locked') guard.fail(task, timestamp)
  else guard.complete(task, timestamp)
}

async function execute(task: NormalizedScheduledTask, context: SchedulerExecutionContext, options: SchedulerRunnerOptions): Promise<unknown> {
  if (task.descriptor.type === 'queue') {
    if (!options.queue) throw new SchedulerHandlerNotFoundError(`No queue dispatcher is registered for scheduled task "${task.name}".`)
    return options.queue.dispatch(task.descriptor, context)
  }
  if (!options.operations || !Object.hasOwn(options.operations, task.descriptor.operation)) throw new SchedulerHandlerNotFoundError(`Scheduled operation "${task.descriptor.operation}" is not registered.`)
  const operation = options.operations[task.descriptor.operation]
  if (!operation) throw new SchedulerHandlerNotFoundError(`Scheduled operation "${task.descriptor.operation}" is not registered.`)
  return operation.execute(context)
}

async function invokeHook(identifier: string | undefined, hooks: Readonly<Record<string, SchedulerHook>> | undefined, context: SchedulerHookContext): Promise<void> {
  if (!identifier) return
  const hook = hooks && Object.hasOwn(hooks, identifier) ? hooks[identifier] : undefined
  if (!hook) throw new SchedulerHandlerNotFoundError(`Scheduler hook "${identifier}" is not registered.`)
  await hook(context)
}

export class ProcessLocalLockProvider implements SchedulerLockProvider {
  readonly capabilities = Object.freeze({ distributed: false })
  readonly #locks = new Map<string, { readonly token: symbol, readonly expiresAt: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  acquire(key: string, expiresAfterSeconds: number): SchedulerLockLease | null {
    if (!Number.isFinite(expiresAfterSeconds) || expiresAfterSeconds <= 0) throw new Error('Lock expiry must be a positive number of seconds.')
    const current = this.#locks.get(key)
    const acquiredAt = this.now()
    if (current && current.expiresAt > acquiredAt) return null
    const token = Symbol(key)
    this.#locks.set(key, { token, expiresAt: acquiredAt + expiresAfterSeconds * 1000 })
    let released = false
    return { release: () => {
      if (!released && this.#locks.get(key)?.token === token) this.#locks.delete(key)
      released = true
    } }
  }
}
