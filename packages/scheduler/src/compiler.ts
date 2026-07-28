import type { NitroConfig } from 'nitro/types'
import type { Schedule } from './Schedule'

export interface TaskDefinition { readonly handler: string, readonly description?: string }
export type CompiledSchedule = Pick<NitroConfig, 'experimental' | 'tasks' | 'scheduledTasks'>

export function compileSchedule(schedule: Schedule, definitions: Readonly<Record<string, TaskDefinition>>): CompiledSchedule {
  const scheduled = new Map<string, string[]>()
  for (const task of schedule.all()) {
    if (!Object.hasOwn(definitions, task.name) || !definitions[task.name]) throw new Error(`Scheduled task "${task.name}" has no registered handler.`)
    const unsupported = [
      task.timezone && 'timezone',
      task.descriptor.type === 'queue' && 'queue dispatch',
      task.overlap && 'withoutOverlapping',
      task.oneServer && 'onOneServer',
      task.maintenance === 'run' && 'maintenance override',
      task.hooks && 'success/failure hooks',
    ].filter(Boolean)
    if (unsupported.length) throw new Error(`Nitro 3 adapter cannot enforce ${unsupported.join(', ')} for scheduled task "${task.name}". Use @nuxt-laravelize/scheduler-nuxt or a policy-aware wrapper.`)
    const names = scheduled.get(task.cron) ?? []
    if (!names.includes(task.name)) names.push(task.name)
    scheduled.set(task.cron, names)
  }
  return {
    experimental: { tasks: true },
    tasks: { ...definitions },
    scheduledTasks: Object.fromEntries([...scheduled].map(([cron, names]) => [cron, names.length === 1 ? names[0]! : [...names]])),
  }
}
