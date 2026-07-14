#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BullMQWorker } from '../src/runtime/BullMQWorker'

interface WorkerConfig { readonly worker: BullMQWorker }

async function main(): Promise<void> {
  const queue = readArgument('--queue', 'default')
  const concurrency = Number(readArgument('--concurrency', '1'))
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive integer')
  const configPath = resolve(readArgument('--config', 'laravelize.queue.config.mjs'))
  const loaded = await import(pathToFileURL(configPath).href) as { default?: WorkerConfig }
  if (!loaded.default?.worker) throw new Error(`${configPath} must default-export { worker }`)
  await loaded.default.worker.work(queue, concurrency)
  const shutdown = async (): Promise<void> => {
    await loaded.default?.worker.stop()
    process.exit(0)
  }
  process.once('SIGINT', () => {
    void shutdown()
  })
  process.once('SIGTERM', () => {
    void shutdown()
  })
}

function readArgument(name: string, fallback: string): string {
  return process.argv.slice(2).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback
}

void main().catch((error) => {
  console.error('[laravelize.queue] worker failed', error)
  process.exitCode = 1
})
