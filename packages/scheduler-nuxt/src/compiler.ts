import { normalizeScheduledTask, type NormalizedScheduledTask, type Schedule, type ScheduledTask } from '@nuxt-laravelize/scheduler'

export interface NitroTaskDefinition {
  readonly handler: string
  readonly description?: string
}

export interface Nitro2SchedulerConfig {
  readonly experimental: { readonly tasks: true }
  readonly tasks: Readonly<Record<string, NitroTaskDefinition>>
  readonly scheduledTasks: Readonly<Record<string, string | readonly string[]>>
  readonly metadata: readonly NormalizedScheduledTask[]
}

export interface MutableNitro2Config {
  experimental?: Record<string, unknown>
  tasks?: Record<string, NitroTaskDefinition>
  scheduledTasks?: Record<string, string | string[]>
}

export type ScheduleSource = Schedule | readonly Schedule[] | readonly ScheduledTask[]

export function compileNuxtSchedule(schedules: ScheduleSource, definitions: Readonly<Record<string, NitroTaskDefinition>>): Nitro2SchedulerConfig {
  const metadata = readTasks(schedules).map(normalizeScheduledTask)
  const names = new Set<string>()
  const grouped = new Map<string, string[]>()
  for (const task of metadata) {
    if (names.has(task.name)) throw new Error(`Scheduled task name "${task.name}" is declared more than once.`)
    names.add(task.name)
    if (!Object.hasOwn(definitions, task.name) || !definitions[task.name]) throw new Error(`Scheduled task "${task.name}" has no registered Nitro 2 handler.`)
    const trigger = providerCronExpression(task)
    const tasks = grouped.get(trigger) ?? []
    tasks.push(task.name)
    grouped.set(trigger, tasks)
  }
  return Object.freeze({
    experimental: Object.freeze({ tasks: true as const }),
    tasks: Object.freeze(toNullPrototypeRecord(definitions)),
    scheduledTasks: Object.freeze(toNullPrototypeRecord(Object.fromEntries([...grouped].map(([cron, tasks]) => [cron, tasks.length === 1 ? tasks[0]! : Object.freeze([...tasks])])))),
    metadata: Object.freeze([...metadata]),
  })
}

export function providerCronExpression(task: ScheduledTask): string {
  return task.timezone ? '* * * * *' : task.cron
}

export function mergeNitro2SchedulerConfig(target: MutableNitro2Config, compiled: Nitro2SchedulerConfig): void {
  target.experimental = { ...target.experimental, tasks: true }
  target.tasks = toNullPrototypeRecord(target.tasks)
  for (const [name, definition] of Object.entries(compiled.tasks)) {
    const current = Object.hasOwn(target.tasks, name) ? target.tasks[name] : undefined
    if (current && (current.handler !== definition.handler || current.description !== definition.description)) throw new Error(`Nitro task "${name}" is already configured with a different handler.`)
    target.tasks[name] = { ...definition }
  }
  target.scheduledTasks = toNullPrototypeRecord(target.scheduledTasks)
  for (const [cron, names] of Object.entries(compiled.scheduledTasks)) {
    const merged = [...asNames(target.scheduledTasks[cron]), ...asNames(names)]
    target.scheduledTasks[cron] = [...new Set(merged)]
    if (target.scheduledTasks[cron]?.length === 1) target.scheduledTasks[cron] = target.scheduledTasks[cron]![0]!
  }
}

function toNullPrototypeRecord<TValue>(source: Readonly<Record<string, TValue>> | undefined): Record<string, TValue> {
  const result: Record<string, TValue> = Object.create(null)
  if (source) {
    for (const [key, value] of Object.entries(source)) result[key] = value
  }
  return result
}

function asNames(value: string | readonly string[] | undefined): string[] {
  if (value == null) return []
  return typeof value === 'string' ? [value] : [...value]
}

function readTasks(source: ScheduleSource): readonly ScheduledTask[] {
  if ('all' in source && typeof source.all === 'function') return source.all()
  const values = source as readonly (Schedule | ScheduledTask)[]
  if (values.length === 0) return []
  const first = values[0]
  return first && typeof first === 'object' && 'cron' in first
    ? values as readonly ScheduledTask[]
    : (values as readonly Schedule[]).flatMap(schedule => schedule.all())
}
