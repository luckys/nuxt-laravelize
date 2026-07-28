import { describe, expect, it } from 'vitest'
import { defineSchedule, DuplicateScheduledTaskError, InvalidTimezoneError, isScheduledTaskDue, normalizeScheduledTask, type Schedule as SchedulerSchedule, type ScheduledTask } from '../src/index'
import { compileSchedule } from '../src/nitro3'

describe('Schedule', () => {
  it('compiles named tasks without running a cron engine', () => {
    const schedule = defineSchedule((value) => {
      value.task('reports:daily').dailyAt('02:30')
      value.task('sessions:prune').hourly()
    })
    expect(compileSchedule(schedule, {
      'reports:daily': { handler: './tasks/reports' },
      'sessions:prune': { handler: './tasks/sessions' },
    }).scheduledTasks).toEqual({
      '30 2 * * *': 'reports:daily',
      '0 * * * *': 'sessions:prune',
    })
  })

  it.each([
    ['timezone', (schedule: SchedulerSchedule) => schedule.task('policy').timezone('Europe/Madrid').daily()],
    ['queue dispatch', (schedule: SchedulerSchedule) => schedule.dispatch('policy', 'job').daily()],
    ['withoutOverlapping', (schedule: SchedulerSchedule) => schedule.task('policy').daily().withoutOverlapping()],
    ['onOneServer', (schedule: SchedulerSchedule) => schedule.task('policy').daily().onOneServer()],
    ['maintenance override', (schedule: SchedulerSchedule) => schedule.task('policy').daily().evenInMaintenanceMode()],
    ['success/failure hooks', (schedule: SchedulerSchedule) => schedule.task('policy').daily().onSuccess('hook')],
  ])('fails closed when the Nitro 3 adapter cannot enforce %s', (policy, declaration) => {
    expect(() => compileSchedule(defineSchedule(declaration), { policy: { handler: './tasks/policy' } })).toThrow(policy)
  })

  it('rejects invalid cron expressions', () => {
    expect(() => defineSchedule(schedule => schedule.task('bad').cron('* * *'))).toThrow('Invalid five-field cron expression')
    expect(() => defineSchedule(schedule => schedule.task('bad').cron('99 99 * * *'))).toThrow('Invalid five-field cron expression')
  })

  it('builds immutable listing metadata with operation and queue descriptors', () => {
    const payload = { tenant: 'acme' }
    const schedule = defineSchedule((value) => {
      value.task('reports:daily', 'reports.generate')
        .dailyAt('02:30')
        .timezone('Europe/Madrid')
        .description('Generate daily reports')
        .withoutOverlapping(15)
        .onOneServer()
        .evenInMaintenanceMode()
        .onSuccess('reports.succeeded')
        .onFailure('reports.failed')
      value.dispatch('mail:digests', { job: 'mail.digest', queue: 'mail', payload }).everyFiveMinutes()
    })

    const tasks = schedule.all()
    expect(tasks[0]).toEqual({
      name: 'reports:daily',
      cron: '30 2 * * *',
      description: 'Generate daily reports',
      timezone: 'Europe/Madrid',
      descriptor: { type: 'operation', operation: 'reports.generate' },
      overlap: { expiresAfterSeconds: 900 },
      oneServer: true,
      maintenance: 'run',
      hooks: { success: 'reports.succeeded', failure: 'reports.failed' },
    })
    expect(tasks[1]?.descriptor).toEqual({ type: 'queue', job: 'mail.digest', queue: 'mail', payload: { tenant: 'acme' } })
    payload.tenant = 'changed'
    const queueDescriptor = tasks[1]?.descriptor
    expect(queueDescriptor?.type).toBe('queue')
    expect(queueDescriptor?.type === 'queue' ? queueDescriptor.payload?.tenant : undefined).toBe('acme')
    expect(Object.isFrozen(tasks[0])).toBe(true)
    expect(Object.isFrozen(tasks[1]?.descriptor)).toBe(true)
  })

  it('rejects duplicate names and invalid IANA timezones', () => {
    expect(() => defineSchedule((schedule) => {
      schedule.task('same').daily()
      schedule.task('same').hourly()
    })).toThrow(DuplicateScheduledTaskError)
    expect(() => defineSchedule(schedule => schedule.task('bad').daily().timezone('Mars/Olympus'))).toThrow(InvalidTimezoneError)
  })

  it('provides common cron helpers', () => {
    const schedule = defineSchedule((value) => {
      value.task('minute').everyMinute()
      value.task('quarter').everyFifteenMinutes()
      value.task('hour').hourlyAt(17)
      value.task('week').weeklyOn(1, '08:05')
      value.task('month').monthlyOn(15, '09:10')
    })
    expect(schedule.all().map(task => task.cron)).toEqual(['* * * * *', '*/15 * * * *', '17 * * * *', '5 8 * * 1', '10 9 15 * *'])
  })

  it('keeps legacy ScheduledTask sources compatible and normalizes snapshots', () => {
    const legacy: ScheduledTask = { name: 'legacy', cron: '0 * * * *' }
    expect(normalizeScheduledTask(legacy)).toEqual({
      name: 'legacy',
      cron: '0 * * * *',
      descriptor: { type: 'operation', operation: 'legacy' },
      oneServer: false,
      maintenance: 'skip',
    })
  })

  it('matches due minutes deterministically in an IANA timezone', () => {
    const task = defineSchedule(schedule => schedule.task('morning').dailyAt('09:00').timezone('America/New_York')).all()[0]!
    const utcTask = defineSchedule(schedule => schedule.task('utc-morning').dailyAt('09:00').timezone('UTC')).all()[0]!
    expect(isScheduledTaskDue(task, Date.parse('2026-01-15T14:00:30Z'))).toBe(true)
    expect(isScheduledTaskDue(task, Date.parse('2026-01-15T09:00:30Z'))).toBe(false)
    expect(isScheduledTaskDue(utcTask, Date.parse('2026-01-15T09:00:30Z'))).toBe(true)
    expect(isScheduledTaskDue(utcTask, Date.parse('2026-01-15T14:00:30Z'))).toBe(false)
  })

  it('is DST-safe for missing and repeated local minutes', () => {
    const missing = defineSchedule(schedule => schedule.task('spring').dailyAt('02:30').timezone('America/New_York')).all()[0]!
    expect(isScheduledTaskDue(missing, Date.parse('2026-03-08T07:30:00Z'))).toBe(false)

    const repeated = defineSchedule(schedule => schedule.task('fall').dailyAt('01:30').timezone('America/New_York')).all()[0]!
    expect(isScheduledTaskDue(repeated, Date.parse('2026-11-01T05:30:00Z'))).toBe(true)
    expect(isScheduledTaskDue(repeated, Date.parse('2026-11-01T06:30:00Z'))).toBe(false)
  })

  it.each([
    ['timezone', { timezone: 'Mars/Olympus' }],
    ['descriptor object', { descriptor: [] }],
    ['descriptor discriminant', { descriptor: { type: 'other' } }],
    ['operation identifier', { descriptor: { type: 'operation', operation: ' ' } }],
    ['queue identifier', { descriptor: { type: 'queue', job: '' } }],
    ['queue payload shape', { descriptor: { type: 'queue', job: 'mail', payload: [] } }],
    ['queue payload values', { descriptor: { type: 'queue', job: 'mail', payload: { callback: () => undefined } } }],
    ['nested undefined queue payload', { descriptor: { type: 'queue', job: 'mail', payload: { nested: { value: undefined } } } }],
    ['sparse queue payload array', { descriptor: { type: 'queue', job: 'mail', payload: { values: Array(1) } } }],
    ['maintenance', { maintenance: 'sometimes' }],
    ['overlap finite positive bound', { overlap: { expiresAfterSeconds: Number.POSITIVE_INFINITY } }],
    ['overlap integer bound', { overlap: { expiresAfterSeconds: 1.5 } }],
    ['oneServer', { oneServer: 'yes' }],
    ['hooks shape', { hooks: [] }],
    ['hook identifier', { hooks: { success: '' } }],
    ['description', { description: ' ' }],
  ])('rejects invalid raw task %s metadata', (_label, metadata) => {
    const raw = { name: 'raw', cron: '0 * * * *', ...metadata } as unknown as ScheduledTask
    expect(() => normalizeScheduledTask(raw)).toThrow()
  })

  it('fully normalizes valid raw task metadata', () => {
    const raw = {
      name: ' raw ', cron: ' 0 * * * * ', timezone: ' America/New_York ', description: ' Raw task ',
      descriptor: { type: 'queue', job: ' mail.send ', queue: ' mail ', payload: { nested: [1, true, null] } },
      maintenance: 'run', oneServer: true, overlap: { expiresAfterSeconds: 60 }, hooks: { success: ' success ', failure: ' failure ' },
    } as unknown as ScheduledTask
    expect(normalizeScheduledTask(raw)).toEqual({
      name: 'raw', cron: '0 * * * *', timezone: 'America/New_York', description: 'Raw task',
      descriptor: { type: 'queue', job: 'mail.send', queue: 'mail', payload: { nested: [1, true, null] } },
      maintenance: 'run', oneServer: true, overlap: { expiresAfterSeconds: 60 }, hooks: { success: 'success', failure: 'failure' },
    })
  })

  it('rejects undefined queue payload values through the direct DSL', () => {
    expect(() => defineSchedule(schedule => schedule.dispatch('invalid', { job: 'mail', payload: { nested: { value: undefined } } }).hourly())).toThrow(/JSON-compatible/)
  })
})
