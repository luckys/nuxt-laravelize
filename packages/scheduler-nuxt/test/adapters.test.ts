import { describe, expect, it, vi } from 'vitest'
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { createCloudflareScheduledHandler, createNodeNitroCronConfig, createVercelCronHandler, toVercelCrons } from '../src/adapters'

describe('platform scheduler adapters', () => {
  const schedule = defineSchedule((value) => {
    value.task('reports daily').daily()
    value.task('cleanup').hourly()
  })

  it('creates Node Nitro cron config and Cloudflare scheduled dispatch', async () => {
    expect(createNodeNitroCronConfig(schedule, {
      'reports daily': { handler: './reports' },
      'cleanup': { handler: './cleanup' },
    }, {
      createHandler: task => `./generated/${task.name}`,
    })).toEqual({
      experimental: { tasks: true },
      tasks: { 'reports daily': { handler: './generated/reports daily' }, 'cleanup': { handler: './generated/cleanup' } },
      scheduledTasks: { '0 0 * * *': 'reports daily', '0 * * * *': 'cleanup' },
    })
    const run = vi.fn(async task => ({ status: 'completed' as const, result: task.name }))
    await expect(createCloudflareScheduledHandler(schedule, { run })({ cron: '0 * * * *' })).resolves.toEqual([{ status: 'completed', result: 'cleanup' }])
  })

  it('creates authenticated Vercel handlers and manifest entries', async () => {
    const run = vi.fn(async () => ({ status: 'completed' as const, result: true }))
    const handler = createVercelCronHandler(schedule.all()[0]!, { run }, 'secret')
    await expect(handler(new Request('https://example.test'))).resolves.toMatchObject({ status: 401 })
    await expect(handler(new Request('https://example.test', { headers: { authorization: 'Bearer secret' } }))).resolves.toMatchObject({ status: 200 })
    expect(toVercelCrons(schedule)[0]).toEqual({ path: '/api/_scheduler/reports%20daily', schedule: '0 0 * * *' })
  })

  it('runs Cloudflare timezone tasks only when scheduledTime is due', async () => {
    const zoned = defineSchedule(value => value.task('zoned').dailyAt('09:00').timezone('America/New_York'))
    const run = vi.fn(async () => ({ status: 'completed' as const, result: true }))
    const handler = createCloudflareScheduledHandler(zoned, { run })
    await expect(handler({ cron: '* * * * *', scheduledTime: Date.parse('2026-01-15T13:00:00Z') })).resolves.toEqual([{ status: 'skipped', reason: 'timezone-not-due' }])
    await expect(handler({ cron: '* * * * *', scheduledTime: Date.parse('2026-01-15T14:00:00Z') })).resolves.toEqual([{ status: 'completed', result: true }])
    await expect(handler({ cron: '* * * * *', scheduledTime: Date.parse('2026-01-15T14:00:30Z') })).resolves.toEqual([{ status: 'skipped', reason: 'duplicate-minute' }])
    await expect(handler({ cron: '* * * * *', scheduledTime: Date.parse('2026-01-16T14:00:00Z') })).resolves.toEqual([{ status: 'completed', result: true }])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('uses minute provider triggers and an injectable Vercel clock for timezone tasks', async () => {
    const zoned = defineSchedule(value => value.task('zoned').dailyAt('09:00').timezone('America/New_York'))
    const task = zoned.all()[0]!
    const run = vi.fn(async () => ({ status: 'completed' as const, result: true }))
    let now = Date.parse('2026-01-15T13:00:00Z')
    const handler = createVercelCronHandler(task, { run }, { secret: 'secret', clock: () => now })
    const request = new Request('https://example.test', { headers: { authorization: 'Bearer secret' } })
    expect(toVercelCrons(zoned)).toEqual([{ path: '/api/_scheduler/zoned', schedule: '* * * * *' }])
    await expect((await handler(request)).json()).resolves.toEqual({ status: 'skipped', reason: 'timezone-not-due' })
    now = Date.parse('2026-01-15T14:00:00Z')
    await expect((await handler(request)).json()).resolves.toEqual({ status: 'completed', result: true })
    expect(createNodeNitroCronConfig(zoned, { zoned: { handler: './runtime' } }, { createHandler: () => './generated/zoned' }).scheduledTasks).toEqual({ '* * * * *': 'zoned' })
  })
})
