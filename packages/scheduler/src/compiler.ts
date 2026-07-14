import type { Schedule } from './Schedule'

export interface TaskDefinition { readonly handler: string, readonly description?: string }
export interface CompiledSchedule {
  readonly experimental: { readonly tasks: true }
  readonly tasks: Readonly<Record<string, TaskDefinition>>
  readonly scheduledTasks: Readonly<Record<string, string | readonly string[]>>
}

export function compileSchedule(schedule: Schedule, definitions: Readonly<Record<string, TaskDefinition>>): CompiledSchedule {
  const scheduled = new Map<string, string[]>()
  for (const task of schedule.all()) {
    if (!definitions[task.name]) throw new Error(`Scheduled task "${task.name}" has no registered handler.`)
    const names = scheduled.get(task.cron) ?? []
    if (!names.includes(task.name)) names.push(task.name)
    scheduled.set(task.cron, names)
  }
  return {
    experimental: { tasks: true },
    tasks: { ...definitions },
    scheduledTasks: Object.fromEntries([...scheduled].map(([cron, names]) => [cron, names.length === 1 ? names[0]! : names])),
  }
}
