#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { runOutboxWorkerCli } from '../cli.js'
import type { OutboxWorker } from '../index.js'

await runOutboxWorkerCli({
  args: process.argv.slice(2),
  signals: process,
  load: async (config = 'outbox-worker.config.js') => {
    const module = await import(pathToFileURL(resolve(config)).href) as { default?: OutboxWorker, worker?: OutboxWorker }
    const worker = module.default ?? module.worker
    if (!worker) throw new TypeError('Worker config must export an OutboxWorker')
    return worker
  },
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
