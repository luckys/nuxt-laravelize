#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BullMQWorker } from '../runtime/BullMQWorker.js'

async function main(): Promise<void> {
  const cliUrl = new URL('../cli.mjs', import.meta.url)
  const { runQueueWorkerCli } = await import(cliUrl.href) as typeof import('../cli')
  await runQueueWorkerCli({ args: process.argv.slice(2), signals: process, load: async (config) => {
    const configPath = resolve(config)
    const loaded = await import(pathToFileURL(configPath).href) as { default?: { worker?: BullMQWorker, close?: () => void | Promise<void> } }
    if (!loaded.default?.worker) throw new Error(`${configPath} must default-export { worker }`)
    return { worker: loaded.default.worker, ...(loaded.default.close ? { close: loaded.default.close } : {}) }
  } })
}

void main().catch((error) => {
  console.error('[laravelize.queue] worker failed', error)
  process.exitCode = 1
})
