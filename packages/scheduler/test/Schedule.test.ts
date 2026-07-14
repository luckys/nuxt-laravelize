import { describe, expect, it } from 'vitest'
import { compileSchedule, defineSchedule } from '../src/index'

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

  it('rejects invalid cron expressions', () => {
    expect(() => defineSchedule(schedule => schedule.task('bad').cron('* * *'))).toThrow('Invalid five-field cron expression')
  })
})
