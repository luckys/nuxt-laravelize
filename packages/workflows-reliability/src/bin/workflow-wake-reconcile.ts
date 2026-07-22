#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runWorkflowWakeReconciliationCli, type WorkflowWakeReconciliationCliConfig } from '../cli.js'

await runWorkflowWakeReconciliationCli({
  args: process.argv.slice(2),
  signals: process,
  load: async (config = 'workflow-wake-reconciliation.config.js') => {
    const path = resolve(config)
    const module = await import(pathToFileURL(path).href) as { default?: WorkflowWakeReconciliationCliConfig }
    if (!module.default?.worker) throw new TypeError(`${path} must default-export { worker }`)
    return module.default
  },
}).catch((error) => {
  console.error('[workflows-reliability] workflow wake reconciliation failed', error)
  process.exitCode = 1
})
