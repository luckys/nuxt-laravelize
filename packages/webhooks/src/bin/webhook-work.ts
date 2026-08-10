#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { OutboxWorker } from '@luckys_luis/nuxt-laravelize-reliability'
import { runOutboxWorkerCli } from '@luckys_luis/nuxt-laravelize-reliability/cli'
import type { OutgoingWebhookProcessor } from '../index.js'

await runOutboxWorkerCli({
  args: process.argv.slice(2),
  signals: process,
  load: async (config = 'webhook-worker.config.js') => {
    const loaded = await import(pathToFileURL(resolve(config)).href) as { default?: { worker?: OutboxWorker, processor?: OutgoingWebhookProcessor, intervalMs?: number, close?: () => void | Promise<void> } }
    if (!loaded.default) throw new TypeError('Webhook worker config must default-export { worker } or { processor }')
    const worker = loaded.default.worker ?? (loaded.default.processor ? new OutboxWorker(loaded.default.processor.processor, { intervalMs: loaded.default.intervalMs }) : undefined)
    if (!worker) throw new TypeError('Webhook worker config must default-export { worker } or { processor }')
    return { worker, ...(loaded.default.close ? { close: loaded.default.close } : {}) }
  },
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
