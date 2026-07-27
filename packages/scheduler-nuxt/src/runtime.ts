import { isScheduledTaskDue, normalizeScheduledTask, type NormalizedScheduledTask, type QueueDispatchDescriptor, type ScheduledTask, type ScheduledTimestamp } from '@nuxt-laravelize/scheduler'

export interface SchedulerExecutionContext {
  readonly task: NormalizedScheduledTask
  readonly payload: Readonly<Record<string, unknown>>
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
}

export interface SchedulerLockProvider {
  readonly capabilities: { readonly distributed: boolean }
  acquire(key: string, expiresAfterSeconds: number): SchedulerLockLease | null | Promise<SchedulerLockLease | null>
}

export interface SchedulerMaintenanceProvider { isActive(): boolean | Promise<boolean> }

export interface SchedulerHookContext extends SchedulerExecutionContext { readonly result?: unknown, readonly error?: unknown }
export type SchedulerHook = (context: SchedulerHookContext) => void | Promise<void>

export interface SchedulerRunnerOptions {
  readonly operations?: Readonly<Record<string, ScheduledOperationHandler>>
  readonly queue?: SchedulerQueueDispatcher
  readonly locks?: SchedulerLockProvider
  readonly maintenance?: SchedulerMaintenanceProvider
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
  run(task: ScheduledTask, payload?: Readonly<Record<string, unknown>>): Promise<SchedulerRunResult>
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
  readonly #lastDueMinute = new Map<string, number>()

  check(task: ScheduledTask, timestamp: ScheduledTimestamp): 'timezone-not-due' | 'duplicate-minute' | undefined {
    const normalizedTask = normalizeScheduledTask(task)
    const instant = timestamp instanceof Date ? timestamp.getTime() : timestamp
    if (!Number.isFinite(instant)) throw new Error('Scheduled timestamp must be a valid Date or epoch millisecond value.')
    const minute = Math.floor(instant / 60_000) * 60_000
    if (normalizedTask.timezone && !isScheduledTaskDue(normalizedTask, instant)) return 'timezone-not-due'
    if (this.#lastDueMinute.get(normalizedTask.name) === minute) return 'duplicate-minute'
    this.#lastDueMinute.set(normalizedTask.name, minute)
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
  return runner.run(task, payload)
}

export function createSchedulerRunner(options: SchedulerRunnerOptions): SchedulerRunner {
  return {
    async run(task, payload = {}) {
      const normalizedTask = normalizeScheduledTask(task)
      const context = { task: normalizedTask, payload }
      const lock = lockRequirement(normalizedTask, options.locks)
      if (normalizedTask.maintenance === 'skip' && await options.maintenance?.isActive()) return { status: 'skipped', reason: 'maintenance' }
      const lease = lock ? await lock.provider.acquire(`scheduler:${normalizedTask.name}`, lock.expiresAfterSeconds) : undefined
      if (lock && !lease) return { status: 'skipped', reason: 'locked' }
      let result: unknown
      try {
        result = await execute(normalizedTask, context, options)
        await lease?.assertOwned?.()
        await invokeHook(normalizedTask.hooks?.success, options.hooks?.success, { ...context, result })
        await lease?.assertOwned?.()
      }
      catch (primaryError) {
        const relatedErrors: unknown[] = []
        try {
          await invokeHook(normalizedTask.hooks?.failure, options.hooks?.failure, { ...context, error: primaryError })
        }
        catch (hookError) { relatedErrors.push(hookError) }
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
      const runtimeInvocation = { ...invocation, payload, scheduledTime }
      const scope = await provider.createScope(runtimeInvocation)
      if (!scope?.runner) throw new Error(`Scheduler runtime provider did not create a runner for task "${normalizedTask.name}".`)
      return runWithCleanup(
        async () => ({ result: await scope.runner.run(normalizedTask, payload) }),
        async () => scope.dispose?.(),
      )
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

function lockRequirement(task: NormalizedScheduledTask, provider?: SchedulerLockProvider): { provider: SchedulerLockProvider, expiresAfterSeconds: number } | undefined {
  if (!task.oneServer && !task.overlap) return undefined
  if (!provider) throw new SchedulerLockCapabilityError(`Scheduled task "${task.name}" requires a lock provider.`)
  if (task.oneServer && !provider.capabilities.distributed) throw new SchedulerLockCapabilityError(`Scheduled task "${task.name}" requires a distributed lock provider for onOneServer.`)
  return { provider, expiresAfterSeconds: task.overlap?.expiresAfterSeconds ?? 24 * 60 * 60 }
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
