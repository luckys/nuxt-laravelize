import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { compileNuxtSchedule, mergeNitro2SchedulerConfig } from '../src/compiler'
import { loadScheduleDeclarations, renderSchedulerTaskModule } from '../src/module'
import { createGeneratedSchedulerTask, createSchedulerRunner } from '../src/runtime'

describe('Nuxt module configuration boundary', () => {
  it('only augments the exact Nitro 2 task fields', () => {
    const config: Record<string, unknown> & { tasks?: Record<string, { handler: string }>, scheduledTasks?: Record<string, string | string[]>, experimental?: Record<string, unknown> } = { preset: 'node-server' }
    const compiled = compileNuxtSchedule(defineSchedule(schedule => schedule.task('tick').everyMinute()), { tick: { handler: './tick' } })
    mergeNitro2SchedulerConfig(config, compiled)
    expect(config.preset).toBe('node-server')
    expect(config).toMatchObject({ experimental: { tasks: true }, tasks: { tick: { handler: './tick' } }, scheduledTasks: { '* * * * *': 'tick' } })
  })

  it('loads only explicitly configured schedule declarations relative to rootDir', async () => {
    const schedules = await loadScheduleDeclarations(['test/fixtures/schedule.ts'], resolve(import.meta.dirname, '..'))
    expect(schedules).toHaveLength(1)
    expect(schedules[0]?.all().map(task => task.name)).toEqual(['fixture:tick'])
  })

  it('generates a Nitro wrapper and executes compiled metadata through runner policies and scope disposal', async () => {
    const execute = vi.fn(async () => 'done')
    const success = vi.fn()
    const release = vi.fn()
    const dispose = vi.fn()
    const schedule = defineSchedule(value => value.task('policy:task', 'policy.operation').hourly().withoutOverlapping(1).onSuccess('audit'))
    const compiled = compileNuxtSchedule(schedule, { 'policy:task': { handler: './runtime-provider' } })
    const task = compiled.metadata[0]!
    const provider = {
      createScope: vi.fn(() => ({
        runner: createSchedulerRunner({
          operations: { 'policy.operation': { execute } },
          locks: { capabilities: { distributed: false }, acquire: vi.fn(() => ({ release })) },
          hooks: { success: { audit: success } },
        }),
        dispose,
      })),
    }
    const generatedTask = createGeneratedSchedulerTask(task, provider)
    await expect(generatedTask.run({ name: task.name, payload: { source: 'nitro' }, context: {} })).resolves.toEqual({ result: { status: 'completed', result: 'done' } })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ payload: { source: 'nitro' } }))
    expect(success).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(renderSchedulerTaskModule(task, './runtime-provider', './scheduler-runtime')).toContain('createGeneratedSchedulerTask(task, runtimeProvider)')
  })
})
