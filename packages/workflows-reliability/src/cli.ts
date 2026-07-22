import type { WorkflowWakeReconciliationWorker } from './index.js'

export type WorkflowWakeReconciliationCliOptions = { once: boolean, help: boolean, config?: string }
export type WorkflowWakeReconciliationCliWorker = Pick<WorkflowWakeReconciliationWorker, 'run' | 'runOnce' | 'stop' | 'drain'>
export type WorkflowWakeReconciliationCliConfig = { worker: WorkflowWakeReconciliationCliWorker, close?: () => void | Promise<void> }

export const WORKFLOW_WAKE_RECONCILIATION_HELP = 'Usage: workflow-wake-reconcile [--once] [--config <module>] [--help]'

const capture = async (operation: (() => void | Promise<void>) | undefined, errors: unknown[]): Promise<void> => {
  if (!operation) return
  try {
    await operation()
  }
  catch (error) {
    if (!errors.includes(error)) errors.push(error)
  }
}

const throwFailures = (errors: unknown[]): void => {
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'Workflow wake reconciliation CLI failed')
}

export function parseWorkflowWakeReconciliationArgs(args: readonly string[]): WorkflowWakeReconciliationCliOptions {
  const parsed: WorkflowWakeReconciliationCliOptions = { once: false, help: false }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--once') parsed.once = true
    else if (argument === '--help' || argument === '-h') parsed.help = true
    else if (argument === '--config') {
      const config = args[++index]
      if (!config || config.startsWith('-')) throw new TypeError('--config requires a module path')
      parsed.config = config
    }
    else throw new TypeError(`Unknown argument: ${argument}`)
  }
  return parsed
}

export async function runWorkflowWakeReconciliationCli(input: {
  args: readonly string[]
  load: (config?: string) => Promise<WorkflowWakeReconciliationCliConfig>
  write?: (value: string) => void
  signals?: Pick<NodeJS.Process, 'once' | 'removeListener'>
}): Promise<void> {
  const options = parseWorkflowWakeReconciliationArgs(input.args)
  if (options.help) {
    ;(input.write ?? console.log)(WORKFLOW_WAKE_RECONCILIATION_HELP)
    return
  }
  const controller = new AbortController()
  let loaded: WorkflowWakeReconciliationCliConfig | undefined
  let stopping: Promise<void> | undefined
  const beginStop = () => {
    if (!loaded || stopping) return
    try {
      stopping = Promise.resolve(loaded.worker.stop())
    }
    catch (error) {
      stopping = Promise.reject(error)
    }
    void stopping.catch(() => {})
  }
  const stop = () => {
    controller.abort()
    beginStop()
  }
  input.signals?.once('SIGINT', stop)
  input.signals?.once('SIGTERM', stop)
  const errors: unknown[] = []
  try {
    try {
      loaded = await input.load(options.config)
    }
    catch (error) {
      if (!errors.includes(error)) errors.push(error)
    }
    if (loaded) {
      if (controller.signal.aborted) beginStop()
      else if (options.once) await capture(() => loaded!.worker.runOnce().then(() => {}), errors)
      else await capture(() => loaded!.worker.run(controller.signal), errors)
      await capture(stopping ? () => stopping : undefined, errors)
    }
  }
  finally {
    input.signals?.removeListener('SIGINT', stop)
    input.signals?.removeListener('SIGTERM', stop)
    const current = loaded
    await capture(current ? () => current.worker.drain() : undefined, errors)
    await capture(current?.close, errors)
  }
  throwFailures(errors)
}
