import { describe, expect, it } from 'vitest'
import { defineSchedule } from '@luckys_luis/nuxt-laravelize-scheduler'
import { compileNuxtSchedule, mergeNitro2SchedulerConfig } from '../src/compiler'

describe('Nuxt Nitro 2 schedule compiler', () => {
  it('compiles grouped tasks and preserves listing metadata', () => {
    const schedule = defineSchedule((value) => {
      value.task('first').hourly().description('First')
      value.task('second').hourly()
    })
    const compiled = compileNuxtSchedule(schedule, {
      first: { handler: './tasks/first', description: 'First handler' },
      second: { handler: './tasks/second' },
    })
    expect(compiled.experimental).toEqual({ tasks: true })
    expect(compiled.scheduledTasks).toEqual({ '0 * * * *': ['first', 'second'] })
    expect(compiled.metadata[0]?.description).toBe('First')
  })

  it('rejects missing handlers and duplicate names across declarations', () => {
    const first = defineSchedule(schedule => schedule.task('same').daily())
    const second = defineSchedule(schedule => schedule.task('same').hourly())
    expect(() => compileNuxtSchedule(first, {})).toThrow(/no registered Nitro 2 handler/)
    expect(() => compileNuxtSchedule([first, second], { same: { handler: './same' } })).toThrow(/more than once/)
  })

  it('merges into Nuxt-owned Nitro config without replacing unrelated options', () => {
    const schedule = defineSchedule(value => value.task('cleanup').daily())
    const compiled = compileNuxtSchedule(schedule, { cleanup: { handler: './cleanup' } })
    const target = {
      experimental: { websocket: true },
      tasks: { existing: { handler: './existing' } },
      scheduledTasks: { '0 0 * * *': 'existing' },
    }
    mergeNitro2SchedulerConfig(target, compiled)
    expect(target.experimental).toEqual({ websocket: true, tasks: true })
    expect(target.tasks).toEqual({ existing: { handler: './existing' }, cleanup: { handler: './cleanup' } })
    expect(target.scheduledTasks).toEqual({ '0 0 * * *': ['existing', 'cleanup'] })
  })

  it('normalizes legacy task records and compiles timezone tasks to minute triggers', () => {
    const legacy = [{ name: 'legacy', cron: '0 * * * *' }]
    expect(compileNuxtSchedule(legacy, { legacy: { handler: './runtime' } }).metadata[0]).toMatchObject({
      descriptor: { type: 'operation', operation: 'legacy' },
      oneServer: false,
      maintenance: 'skip',
    })
    const timezone = defineSchedule(schedule => schedule.task('zoned').daily().timezone('Europe/Madrid'))
    expect(compileNuxtSchedule(timezone, { zoned: { handler: './runtime' } }).scheduledTasks).toEqual({ '* * * * *': 'zoned' })
  })

  it.each(['constructor', 'toString', '__proto__'])('does not resolve inherited task definition %s', (name) => {
    const schedule = defineSchedule(value => value.task(name).hourly())
    expect(() => compileNuxtSchedule(schedule, {})).toThrow(/no registered Nitro 2 handler/)
  })
})
