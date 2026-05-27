#!/usr/bin/env node
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createContainer } from '../src/core/container/Container'
import type { ServiceProvider } from '../src/core/providers/ServiceProvider'
import { seederRegistryToken } from '../src/database/seeding/SeederRegistryToken'

interface DbSeedConfig {
  providers: Array<() => Promise<ServiceProvider> | ServiceProvider>
}

interface CliArgs {
  className: string | null
  configPath: string
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    className: null,
    configPath: resolvePath(process.cwd(), 'laravelize.seed.config.ts'),
  }
  for (const a of argv) {
    if (a.startsWith('--class=')) args.className = a.slice('--class='.length)
    if (a.startsWith('--config=')) args.configPath = resolvePath(process.cwd(), a.slice('--config='.length))
  }
  return args
}

async function loadConfig(configPath: string): Promise<DbSeedConfig> {
  const url = pathToFileURL(configPath).href
  const mod = await import(url) as { default: DbSeedConfig }
  if (!mod.default) throw new Error(`Config file ${configPath} must export a default object`)
  return mod.default
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = await loadConfig(args.configPath)

  const container = createContainer()
  const providers: ServiceProvider[] = []
  for (const factory of config.providers) providers.push(await factory())
  for (const provider of providers) provider.register(container)
  for (const provider of providers) {
    if (provider.boot) await provider.boot(container)
  }
  container.seal()

  const registry = container.make(seederRegistryToken)
  const names = args.className === null ? registry.list() : [args.className]

  for (const name of names) {
    if (!registry.has(name)) {
      console.error(`[laravelize.db:seed] unknown seeder "${name}"`)
      process.exitCode = 1
      continue
    }
    const seeder = await registry.resolve(name)
    console.log(`[laravelize.db:seed] running ${name}`)
    await seeder.run()
    console.log(`[laravelize.db:seed] ${name} done`)
  }
}

main().catch((error) => {
  console.error('[laravelize.db:seed] failed', error)
  process.exit(1)
})
