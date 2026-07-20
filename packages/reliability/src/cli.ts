import type { OutboxWorker } from './index.js'

export type OutboxWorkerCliOptions = { once: boolean, help: boolean, config?: string }
export function parseOutboxWorkerArgs(args: readonly string[]): OutboxWorkerCliOptions {
  const parsed: OutboxWorkerCliOptions = { once: false, help: false }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--once') parsed.once = true
    else if (argument === '--help' || argument === '-h') parsed.help = true
    else if (argument === '--config') {
      const config = args[++index]
      if (!config) throw new TypeError('--config requires a module path')
      parsed.config = config
    }
    else throw new TypeError(`Unknown argument: ${argument}`)
  }
  return parsed
}
export const OUTBOX_WORK_HELP = 'Usage: outbox-work [--once] [--config <module>] [--help]'
export type OutboxWorkerCliConfig = { worker: OutboxWorker, close?: () => void | Promise<void> }
export async function runOutboxWorkerCli(input: {
  args: readonly string[]
  load: (config?: string) => Promise<OutboxWorker | OutboxWorkerCliConfig>
  write?: (value: string) => void
  signals?: Pick<NodeJS.Process, 'once' | 'removeListener'>
}): Promise<void> {
  const options = parseOutboxWorkerArgs(input.args)
  if (options.help) {
    ;(input.write ?? console.log)(OUTBOX_WORK_HELP)
    return
  }
  const loaded = await input.load(options.config)
  const { worker, close } = 'worker' in loaded ? loaded : { worker: loaded, close: undefined }
  if (options.once) {
    try {
      await worker.runOnce()
    }
    finally {
      await close?.()
    }
    return
  }
  const controller = new AbortController()
  let stopping: Promise<void> | undefined
  const stop = () => {
    controller.abort()
    stopping ??= worker.stop()
  }
  input.signals?.once('SIGINT', stop)
  input.signals?.once('SIGTERM', stop)
  try {
    await worker.run(controller.signal)
    await stopping
  }
  finally {
    input.signals?.removeListener('SIGINT', stop)
    input.signals?.removeListener('SIGTERM', stop)
    await worker.drain()
    await close?.()
  }
}
