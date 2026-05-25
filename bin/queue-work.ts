#!/usr/bin/env node
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createContainer } from '../src/core/container/Container'
import type { ServiceProvider } from '../src/core/providers/ServiceProvider'
import { queueWorkerToken } from '../src/queue/QueueWorkerToken'

interface QueueWorkConfig {
  providers: Array<() => Promise<ServiceProvider> | ServiceProvider>
}

interface CliArgs {
  queue: string
  concurrency: number
  configPath: string
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    queue: 'default',
    concurrency: 1,
    configPath: resolvePath(process.cwd(), 'laravelize.queue.config.ts'),
  }
  for (const a of argv) {
    if (a.startsWith('--queue=')) args.queue = a.slice('--queue='.length)
    if (a.startsWith('--concurrency=')) args.concurrency = Number(a.slice('--concurrency='.length))
    if (a.startsWith('--config=')) args.configPath = resolvePath(process.cwd(), a.slice('--config='.length))
  }
  return args
}

async function loadConfig(configPath: string): Promise<QueueWorkConfig> {
  const url = pathToFileURL(configPath).href
  const mod = await import(url) as { default: QueueWorkConfig }
  if (!mod.default) {
    throw new Error(`Config file ${configPath} must export a default object`)
  }
  return mod.default
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = await loadConfig(args.configPath)

  const container = createContainer()
  const providers: ServiceProvider[] = []
  for (const factory of config.providers) {
    providers.push(await factory())
  }
  for (const provider of providers) provider.register(container)
  for (const provider of providers) {
    if (provider.boot) await provider.boot(container)
  }
  container.seal()

  const worker = container.make(queueWorkerToken)
  await worker.work(args.queue, args.concurrency)

  const shutdown = async (): Promise<void> => {
    await worker.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })

  console.log(`[laravelize.queue:work] worker started on queue "${args.queue}" with concurrency ${args.concurrency}`)
}

main().catch((error) => {
  console.error('[laravelize.queue:work] failed to start', error)
  process.exit(1)
})
