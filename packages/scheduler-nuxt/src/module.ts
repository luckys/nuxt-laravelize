import { isAbsolute, resolve } from 'node:path'
import { createJiti } from 'jiti'
import { addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'
import { Schedule, defineSchedule, type NormalizedScheduledTask } from '@luckys_luis/nuxt-laravelize-scheduler'
import { compileNuxtSchedule, mergeNitro2SchedulerConfig, type MutableNitro2Config, type NitroTaskDefinition } from './compiler'

export interface ModuleOptions {
  readonly enabled?: boolean
  readonly schedules?: string | readonly string[]
  readonly tasks?: Readonly<Record<string, NitroTaskDefinition>>
}

type Declaration = Schedule | readonly Schedule[] | ((schedule: Schedule) => void)

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-scheduler-nuxt', configKey: 'laravelizeScheduler', compatibility: { nuxt: '>=4.4.5 <5' } },
  defaults: { enabled: false, schedules: [], tasks: {} },
  async setup(options, nuxt) {
    if (!options.enabled) return
    const paths = typeof options.schedules === 'string' ? [options.schedules] : [...(options.schedules ?? [])]
    if (paths.length === 0) throw new Error('[scheduler-nuxt] At least one explicit schedule declaration is required when enabled.')
    const schedules = await loadScheduleDeclarations(paths, nuxt.options.rootDir)
    const definitions = options.tasks ?? {}
    const source = compileNuxtSchedule(schedules, definitions)
    const runtimeEntry = createResolver(import.meta.url).resolve('./runtime.mjs')
    const wrappedDefinitions: Record<string, NitroTaskDefinition> = Object.create(null)
    for (const task of source.metadata) {
      const definition = getOwnDefinition(definitions, task.name)
      const provider = resolveProvider(definition.handler, nuxt.options.rootDir)
      const template = addTemplate({
        filename: `laravelize/scheduler/${Buffer.from(task.name).toString('base64url')}.mjs`,
        write: true,
        getContents: () => renderSchedulerTaskModule(task, provider, runtimeEntry),
      })
      wrappedDefinitions[task.name] = { handler: template.dst, description: definition.description ?? task.description }
    }
    const compiled = compileNuxtSchedule(schedules, wrappedDefinitions)
    ;(nuxt.hooks as { hook(name: 'nitro:config', callback: (config: MutableNitro2Config) => void): void }).hook('nitro:config', config => mergeNitro2SchedulerConfig(config, compiled))
  },
})

export default module

export async function loadScheduleDeclarations(paths: readonly string[], rootDir: string): Promise<readonly Schedule[]> {
  const jiti = createJiti(import.meta.url)
  const schedules: Schedule[] = []
  for (const path of paths) {
    if (!path.trim()) throw new Error('[scheduler-nuxt] Schedule declaration path cannot be empty.')
    const loaded = await jiti.import(isAbsolute(path) ? path : resolve(rootDir, path), { default: true }) as Declaration
    schedules.push(...normalizeDeclaration(loaded, path))
  }
  return schedules
}

function normalizeDeclaration(declaration: Declaration, path: string): readonly Schedule[] {
  if (isSchedule(declaration)) return [declaration]
  if (Array.isArray(declaration) && declaration.every(isSchedule)) return declaration
  if (typeof declaration === 'function') return [defineSchedule(declaration)]
  throw new Error(`[scheduler-nuxt] Schedule declaration "${path}" must default-export a Schedule, Schedule array, or declaration callback.`)
}

function isSchedule(value: unknown): value is Schedule {
  return value instanceof Schedule || Boolean(value && typeof value === 'object' && typeof (value as { all?: unknown }).all === 'function')
}

export function renderSchedulerTaskModule(
  task: NormalizedScheduledTask,
  provider: string,
  runtimeEntry = '@luckys_luis/nuxt-laravelize-scheduler-nuxt/runtime',
): string {
  let serialized: string
  try {
    serialized = JSON.stringify(task)
  }
  catch (error) { throw new Error(`Scheduled task "${task.name}" metadata must be serializable for Nitro runtime generation.`, { cause: error }) }
  return `import runtimeProvider from ${JSON.stringify(provider)}\nimport { createGeneratedSchedulerTask } from ${JSON.stringify(runtimeEntry)}\nconst task = ${serialized}\nexport default createGeneratedSchedulerTask(task, runtimeProvider, { timestampSource: "wall-clock" })\n`
}

function resolveProvider(handler: string, rootDir: string): string {
  if (!handler.trim()) throw new Error('[scheduler-nuxt] Scheduler runtime provider path cannot be empty.')
  return isAbsolute(handler) ? handler : handler.startsWith('.') ? resolve(rootDir, handler) : handler
}

function getOwnDefinition(definitions: Readonly<Record<string, NitroTaskDefinition>>, name: string): NitroTaskDefinition {
  if (!Object.hasOwn(definitions, name)) throw new Error(`Scheduled task "${name}" has no registered runtime provider.`)
  return definitions[name]!
}
