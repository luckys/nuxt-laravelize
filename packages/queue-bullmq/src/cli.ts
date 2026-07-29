import type { BullMQWorker } from './runtime/BullMQWorker'

export interface QueueWorkerArguments { queue: string, concurrency: number, config: string, help: boolean }
export interface QueueWorkerConfig { worker: Pick<BullMQWorker, 'work' | 'stop'>, close?: () => void | Promise<void> }
export const QUEUE_WORK_HELP = 'Usage: laravelize-queue-work [--queue=<name>] [--concurrency=<number>] [--config=<module>] [--help]'
const MAX_CONCURRENCY = 100

export function parseQueueWorkerArguments(args: readonly string[]): QueueWorkerArguments {
  const value = (name: string, fallback: string) => args.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1) || fallback
  const known = args.every(argument => argument === '--help' || argument === '-h' || ['--queue=', '--concurrency=', '--config='].some(prefix => argument.startsWith(prefix)))
  if (!known) throw new TypeError('Unknown queue worker argument')
  const concurrency = Number(value('--concurrency', '1'))
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) throw new TypeError(`--concurrency must be an integer between 1 and ${MAX_CONCURRENCY}`)
  return { queue: value('--queue', 'default'), concurrency, config: value('--config', 'laravelize.queue.config.mjs'), help: args.includes('--help') || args.includes('-h') }
}

export async function runQueueWorkerCli(input: {
  args: readonly string[]
  load: (config: string) => Promise<QueueWorkerConfig>
  signals: Pick<NodeJS.Process, 'once' | 'removeListener'>
  write?: (value: string) => void
}): Promise<void> {
  const options = parseQueueWorkerArguments(input.args)
  if (options.help) {
    ;(input.write ?? console.log)(QUEUE_WORK_HELP)
    return
  }
  const config = await input.load(options.config)
  let shutdown: Promise<void> | undefined
  let release!: () => void
  const stopped = new Promise<void>((resolve) => {
    release = resolve
  })
  const cleanup = async () => {
    const errors: unknown[] = []
    try {
      await config.worker.stop()
    }
    catch (error) {
      errors.push(error)
    }
    try {
      await config.close?.()
    }
    catch (error) {
      errors.push(error)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'Queue worker drain and resource cleanup failed')
  }
  const stop = () => {
    shutdown ??= cleanup().finally(release)
  }
  input.signals.once('SIGINT', stop)
  input.signals.once('SIGTERM', stop)
  let operationFailed = false
  let operationError: unknown
  let cleanupFailed = false
  let cleanupError: unknown
  try {
    await config.worker.work(options.queue, options.concurrency)
    await stopped
  }
  catch (error) {
    operationFailed = true
    operationError = error
  }
  finally {
    input.signals.removeListener('SIGINT', stop)
    input.signals.removeListener('SIGTERM', stop)
    shutdown ??= cleanup()
    try {
      await shutdown
    }
    catch (error) {
      cleanupFailed = true
      cleanupError = error
    }
  }
  if (operationFailed && cleanupFailed) throw new AggregateError([operationError, cleanupError], 'Queue worker operation and cleanup failed')
  if (operationFailed) throw operationError
  if (cleanupFailed) throw cleanupError
}
