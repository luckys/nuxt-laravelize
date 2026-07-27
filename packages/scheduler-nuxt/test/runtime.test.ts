import { describe, expect, it, vi } from 'vitest'
import { defineSchedule, type ScheduledTask } from '@nuxt-laravelize/scheduler'
import { createGeneratedSchedulerTask, createSchedulerRunner, ProcessLocalLockProvider, SchedulerLockCapabilityError, SchedulerLockLostError, type SchedulerLockProvider } from '../src/runtime'

const taskFrom = (declare: Parameters<typeof defineSchedule>[0]): ScheduledTask => defineSchedule(declare).all()[0]!

describe('scheduler execution runner', () => {
  it('runs operation and queue descriptors through explicit handlers and scoped hooks', async () => {
    const succeeded = vi.fn()
    const operation = vi.fn(async () => 42)
    const dispatch = vi.fn(async descriptor => descriptor.job)
    const runner = createSchedulerRunner({
      operations: { report: { execute: operation } },
      queue: { dispatch },
      hooks: { success: { audited: succeeded } },
    })
    const operationTask = taskFrom(schedule => schedule.task('report:run', 'report').daily().onSuccess('audited'))
    const queueTask = taskFrom(schedule => schedule.dispatch('mail:send', { job: 'mail', payload: { id: 1 } }).hourly())

    await expect(runner.run(operationTask, { source: 'test' })).resolves.toEqual({ status: 'completed', result: 42 })
    await expect(runner.run(queueTask)).resolves.toEqual({ status: 'completed', result: 'mail' })
    expect(operation).toHaveBeenCalledWith(expect.objectContaining({ task: operationTask, payload: { source: 'test' } }))
    expect(succeeded).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith(queueTask.descriptor, expect.objectContaining({ task: queueTask }))
  })

  it('applies maintenance behavior and failure hooks', async () => {
    const failure = vi.fn()
    const execute = vi.fn().mockRejectedValue(new Error('failed'))
    const runner = createSchedulerRunner({
      operations: { cleanup: { execute } },
      maintenance: { isActive: () => true },
      hooks: { failure: { alert: failure } },
    })
    const skipped = taskFrom(schedule => schedule.task('skip', 'cleanup').daily())
    const allowed = taskFrom(schedule => schedule.task('run', 'cleanup').daily().evenInMaintenanceMode().onFailure('alert'))
    await expect(runner.run(skipped)).resolves.toEqual({ status: 'skipped', reason: 'maintenance' })
    await expect(runner.run(allowed)).rejects.toThrow('failed')
    expect(execute).toHaveBeenCalledOnce()
    expect(failure).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }))
  })

  it('fails closed when onOneServer has no distributed lock capability', async () => {
    const execute = vi.fn()
    const task = taskFrom(schedule => schedule.task('singleton').hourly().onOneServer())
    await expect(createSchedulerRunner({ operations: { singleton: { execute } } }).run(task)).rejects.toBeInstanceOf(SchedulerLockCapabilityError)
    await expect(createSchedulerRunner({ operations: { singleton: { execute } }, locks: new ProcessLocalLockProvider() }).run(task)).rejects.toBeInstanceOf(SchedulerLockCapabilityError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('skips an overlapping execution and releases an acquired lock', async () => {
    let held = false
    const release = vi.fn(() => {
      held = false
    })
    const locks: SchedulerLockProvider = {
      capabilities: { distributed: true },
      acquire: vi.fn(() => {
        if (held) return null
        held = true
        return { release }
      }),
    }
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const runner = createSchedulerRunner({ operations: { slow: { execute: () => pending } }, locks })
    const task = taskFrom(schedule => schedule.task('slow').hourly().withoutOverlapping(1))
    const first = runner.run(task)
    await expect(runner.run(task)).resolves.toEqual({ status: 'skipped', reason: 'locked' })
    finish()
    await first
    expect(release).toHaveBeenCalledOnce()
  })

  it('expires process-local locks using an injectable clock without stale lease release', () => {
    let now = 1_000
    const locks = new ProcessLocalLockProvider(() => now)
    const staleLease = locks.acquire('task', 10)
    expect(locks.acquire('task', 10)).toBeNull()
    now = 11_001
    const currentLease = locks.acquire('task', 10)
    expect(currentLease).not.toBeNull()
    staleLease?.release()
    expect(locks.acquire('task', 10)).toBeNull()
    currentLease?.release()
    expect(locks.acquire('task', 10)).not.toBeNull()
  })

  it('uses advancing Node wall clock despite Nitro startup-constant scheduledTime payloads', async () => {
    const execute = vi.fn(async () => 'ran')
    const task = taskFrom(schedule => schedule.task('zoned').everyMinute().timezone('America/New_York'))
    const createScope = vi.fn(() => ({ runner: createSchedulerRunner({ operations: { zoned: { execute } } }) }))
    let now = Date.parse('2026-01-15T14:00:00Z')
    const generated = createGeneratedSchedulerTask(task, {
      createScope,
    }, () => now)
    const nitroPayload = { scheduledTime: Date.parse('2026-01-01T00:00:00Z') }
    await expect(generated.run({ name: 'zoned', payload: nitroPayload })).resolves.toEqual({ result: { status: 'completed', result: 'ran' } })
    now += 30_000
    await expect(generated.run({ name: 'zoned', payload: nitroPayload })).resolves.toEqual({ result: { status: 'skipped', reason: 'duplicate-minute' } })
    now += 30_000
    await expect(generated.run({ name: 'zoned', payload: nitroPayload })).resolves.toEqual({ result: { status: 'completed', result: 'ran' } })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(createScope).toHaveBeenCalledTimes(2)
  })

  it('strips stale Nitro timing metadata while retaining deliberate application payload', async () => {
    const execute = vi.fn(async context => context.payload)
    const task = taskFrom(schedule => schedule.task('delayed').dailyAt('09:00').timezone('America/New_York'))
    const generated = createGeneratedSchedulerTask(task, {
      createScope: invocation => ({
        runner: createSchedulerRunner({ operations: { delayed: { execute } } }),
        dispose: vi.fn(),
        invocation,
      }),
    }, () => Date.parse('2026-01-15T14:00:45Z'))
    const payload = { scheduledTime: Date.parse('2026-01-01T00:00:00Z'), report: 'daily', user: { scheduledTime: 'deliberate' } }
    await expect(generated.run({ name: 'delayed', payload, context: {} })).resolves.toEqual({
      result: { status: 'completed', result: { report: 'daily', user: { scheduledTime: 'deliberate' } } },
    })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ payload: { report: 'daily', user: { scheduledTime: 'deliberate' } } }))
    expect(payload).toHaveProperty('scheduledTime')
  })

  it.each(['constructor', 'toString', '__proto__'])('does not resolve inherited operation or hook %s', async (identifier) => {
    const operationTask = taskFrom(schedule => schedule.task(`operation:${identifier}`, identifier).hourly())
    await expect(createSchedulerRunner({ operations: {} }).run(operationTask)).rejects.toThrow(/not registered/)
    const hookTask = taskFrom(schedule => schedule.task(`hook:${identifier}`, 'valid').hourly().onSuccess(identifier))
    await expect(createSchedulerRunner({ operations: { valid: { execute: () => 'done' } }, hooks: { success: {} } }).run(hookTask)).rejects.toThrow(/not registered/)
  })

  it.each(['execution', 'success-hook', 'lock-lost'] as const)('preserves the primary %s error when lock release also fails', async (failure) => {
    const primaryError = failure === 'lock-lost' ? new SchedulerLockLostError(`${failure} failed`) : new Error(`${failure} failed`)
    const releaseError = new Error('release failed')
    const task = taskFrom((schedule) => {
      const pending = schedule.task(`dual:${failure}`, 'dual').hourly().withoutOverlapping(1)
      if (failure === 'success-hook') pending.onSuccess('success')
    })
    const runner = createSchedulerRunner({
      operations: { dual: { execute: () => {
        if (failure === 'execution') throw primaryError
        return 'done'
      } } },
      hooks: { success: { success: () => { throw primaryError } } },
      locks: {
        capabilities: { distributed: false },
        acquire: () => ({
          assertOwned: () => { if (failure === 'lock-lost') throw primaryError },
          release: () => { throw releaseError },
        }),
      },
    })
    const error: unknown = await runner.run(task).then(() => undefined, value => value)
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error('Expected an AggregateError.')
    expect(error.errors).toEqual([primaryError, releaseError])
    expect(error.cause).toBe(primaryError)
  })
})
