import { normalizeScheduledTask, type NormalizedScheduledTask, type Schedule, type ScheduledTask } from '@luckys_luis/nuxt-laravelize-scheduler'
import { compileNuxtSchedule, providerCronExpression, type NitroTaskDefinition } from './compiler'
import { runScheduledTaskIfDue, ScheduledMinuteGuard, type SchedulerClock, type SchedulerRunResult, type SchedulerRunner } from './runtime'

export interface NodeNitroWrapperFactory {
  createHandler(task: NormalizedScheduledTask, runtimeProvider: NitroTaskDefinition): string
}

export function createNodeNitroCronConfig(schedule: Schedule | readonly Schedule[], runtimeProviders: Readonly<Record<string, NitroTaskDefinition>>, wrappers: NodeNitroWrapperFactory) {
  if (!wrappers) throw new Error('Node Nitro cron configuration requires generated SchedulerRunner wrapper handlers.')
  const source = compileNuxtSchedule(schedule, runtimeProviders)
  const definitions: Record<string, NitroTaskDefinition> = Object.create(null)
  for (const task of source.metadata) {
    const runtimeProvider = getOwnRuntimeProvider(runtimeProviders, task.name)
    definitions[task.name] = {
      handler: wrappers.createHandler(task, runtimeProvider),
      description: runtimeProvider.description ?? task.description,
    }
  }
  const { metadata: _metadata, ...config } = compileNuxtSchedule(schedule, definitions)
  return config
}

export interface CloudflareScheduledController { readonly cron: string, readonly scheduledTime?: number }

export function createCloudflareScheduledHandler(schedule: Schedule | readonly Schedule[], runner: SchedulerRunner, clock: SchedulerClock = Date.now) {
  const tasks = listTasks(schedule)
  const guard = new ScheduledMinuteGuard()
  return async (controller: CloudflareScheduledController): Promise<readonly SchedulerRunResult[]> => {
    const scheduledTime = controller.scheduledTime ?? clock()
    return Promise.all(tasks.filter(task => providerCronExpression(task) === controller.cron).map(task => runScheduledTaskIfDue(task, runner, scheduledTime, guard)))
  }
}

export interface VercelCronHandlerOptions { readonly secret: string, readonly clock?: SchedulerClock }

export function createVercelCronHandler(task: ScheduledTask, runner: SchedulerRunner, input: string | VercelCronHandlerOptions) {
  const { secret, clock = Date.now } = typeof input === 'string' ? { secret: input, clock: Date.now } : input
  if (!secret) throw new Error('A non-empty Vercel cron secret is required.')
  const normalizedTask = normalizeScheduledTask(task)
  const guard = new ScheduledMinuteGuard()
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } })
    if (request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })
    const result = await runScheduledTaskIfDue(normalizedTask, runner, clock(), guard)
    return Response.json(result)
  }
}

export function toVercelCrons(schedule: Schedule | readonly Schedule[], pathPrefix = '/api/_scheduler'): readonly { path: string, schedule: string }[] {
  const prefix = pathPrefix.replace(/\/+$/, '')
  return listTasks(schedule).map(task => ({ path: `${prefix}/${encodeURIComponent(task.name)}`, schedule: providerCronExpression(task) }))
}

function listTasks(schedule: Schedule | readonly Schedule[]): readonly NormalizedScheduledTask[] {
  return (Array.isArray(schedule) ? schedule : [schedule]).flatMap(item => item.all()).map(normalizeScheduledTask)
}

function getOwnRuntimeProvider(runtimeProviders: Readonly<Record<string, NitroTaskDefinition>>, name: string): NitroTaskDefinition {
  if (!Object.hasOwn(runtimeProviders, name)) throw new Error(`Scheduled task "${name}" has no registered runtime provider.`)
  return runtimeProviders[name]!
}
