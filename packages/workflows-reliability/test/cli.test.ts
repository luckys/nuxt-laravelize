import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { parseWorkflowWakeReconciliationArgs, runWorkflowWakeReconciliationCli, WORKFLOW_WAKE_RECONCILIATION_HELP, type WorkflowWakeReconciliationCliConfig, type WorkflowWakeReconciliationCliWorker } from '../src/cli.js'
import type { WorkflowWakeReconcileResult } from '../src/index.js'

const worker = (overrides: Partial<WorkflowWakeReconciliationCliWorker> = {}): WorkflowWakeReconciliationCliWorker => ({
  run: vi.fn(async signal => await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), { once: true }))),
  runOnce: vi.fn(async () => ({ scheduled: [], skipped: [], failed: [] })),
  stop: vi.fn(async () => {}),
  drain: vi.fn(async () => {}),
  ...overrides,
})

describe('workflow wake reconciliation CLI', () => {
  it('parses supported arguments and rejects malformed config flags', () => {
    expect(parseWorkflowWakeReconciliationArgs([])).toEqual({ once: false, help: false })
    expect(parseWorkflowWakeReconciliationArgs(['--once', '--config', './worker.mjs'])).toEqual({ once: true, help: false, config: './worker.mjs' })
    expect(parseWorkflowWakeReconciliationArgs(['-h'])).toEqual({ once: false, help: true })
    expect(() => parseWorkflowWakeReconciliationArgs(['--config', '--help'])).toThrow('--config requires a module path')
    expect(() => parseWorkflowWakeReconciliationArgs(['unexpected'])).toThrow('Unknown argument: unexpected')
  })

  it('prints help without loading configuration', async () => {
    const load = vi.fn<() => Promise<WorkflowWakeReconciliationCliConfig>>()
    const write = vi.fn()
    await runWorkflowWakeReconciliationCli({ args: ['--help'], load, write })
    expect(write).toHaveBeenCalledWith(WORKFLOW_WAKE_RECONCILIATION_HELP)
    expect(load).not.toHaveBeenCalled()
  })

  it('runs one cycle and closes resources on success or failure', async () => {
    const close = vi.fn(async () => {})
    const successful = worker()
    await runWorkflowWakeReconciliationCli({ args: ['--once'], load: async () => ({ worker: successful, close }) })
    expect(successful.runOnce).toHaveBeenCalledOnce()
    expect(successful.stop).not.toHaveBeenCalled()
    const failing = worker({ runOnce: vi.fn(async () => {
      throw new Error('scan failed')
    }) })
    await expect(runWorkflowWakeReconciliationCli({ args: ['--once'], load: async () => ({ worker: failing, close }) })).rejects.toThrow('scan failed')
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('deduplicates signal shutdown and closes after draining', async () => {
    const signals = new EventEmitter()
    const order: string[] = []
    const current = worker({
      stop: vi.fn(async () => { order.push('stop') }),
      drain: vi.fn(async () => { order.push('drain') }),
    })
    const running = runWorkflowWakeReconciliationCli({
      args: [],
      signals: signals as never,
      load: async () => ({ worker: current, close: async () => { order.push('close') } }),
    })
    await Promise.resolve()
    signals.emit('SIGTERM')
    signals.emit('SIGINT')
    await running
    expect(current.stop).toHaveBeenCalledOnce()
    expect(order).toEqual(['stop', 'drain', 'close'])
    expect(signals.listenerCount('SIGTERM')).toBe(0)
    expect(signals.listenerCount('SIGINT')).toBe(0)
  })

  it('closes resources when draining fails', async () => {
    const close = vi.fn(async () => {})
    const current = worker({
      run: vi.fn(async () => {
        throw new Error('run failed')
      }),
      drain: vi.fn(async () => {
        throw new Error('drain failed')
      }),
    })
    const failure = await runWorkflowWakeReconciliationCli({ args: [], load: async () => ({ worker: current, close }) }).catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([expect.objectContaining({ message: 'run failed' }), expect.objectContaining({ message: 'drain failed' })])
    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves one-shot and cleanup failures together', async () => {
    const current = worker({ runOnce: vi.fn(async () => {
      throw new Error('scan failed')
    }) })
    const failure = await runWorkflowWakeReconciliationCli({
      args: ['--once'],
      load: async () => ({ worker: current, close: async () => { throw new Error('close failed') } }),
    }).catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([expect.objectContaining({ message: 'scan failed' }), expect.objectContaining({ message: 'close failed' })])
  })

  it('gracefully closes when signalled during configuration loading', async () => {
    const signals = new EventEmitter()
    const current = worker()
    const close = vi.fn(async () => {})
    let resolveConfig!: (config: WorkflowWakeReconciliationCliConfig) => void
    const running = runWorkflowWakeReconciliationCli({
      args: [],
      signals: signals as never,
      load: () => new Promise((resolve) => { resolveConfig = resolve }),
    })
    signals.emit('SIGTERM')
    resolveConfig({ worker: current, close })

    await running
    expect(current.run).not.toHaveBeenCalled()
    expect(current.stop).toHaveBeenCalledOnce()
    expect(current.drain).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('observes shutdown failures and still closes resources', async () => {
    const signals = new EventEmitter()
    const close = vi.fn(async () => {})
    const current = worker({ stop: vi.fn(async () => {
      throw new Error('stop failed')
    }) })
    const running = runWorkflowWakeReconciliationCli({ args: [], signals: signals as never, load: async () => ({ worker: current, close }) })
    await Promise.resolve()
    signals.emit('SIGTERM')

    await expect(running).rejects.toThrow('stop failed')
    expect(close).toHaveBeenCalledOnce()
  })

  it('captures synchronous shutdown failures from signal handlers', async () => {
    const signals = new EventEmitter()
    const close = vi.fn(async () => {})
    let finishRun!: () => void
    const current = worker({
      run: vi.fn(() => new Promise<void>((resolve) => { finishRun = resolve })),
      stop: vi.fn(() => { throw new Error('synchronous stop failure') }),
    })
    const running = runWorkflowWakeReconciliationCli({ args: [], signals: signals as never, load: async () => ({ worker: current, close }) })
    await Promise.resolve()
    signals.emit('SIGTERM')
    await Promise.resolve()
    finishRun()

    await expect(running).rejects.toThrow('synchronous stop failure')
    expect(close).toHaveBeenCalledOnce()
  })

  it('gracefully drains one-shot work when signalled', async () => {
    const signals = new EventEmitter()
    const close = vi.fn(async () => {})
    let finishRun!: () => void
    const current = worker({ runOnce: vi.fn(() => new Promise<WorkflowWakeReconcileResult>((resolve) => {
      finishRun = () => resolve({ scheduled: [], skipped: [], failed: [] })
    })) })
    const running = runWorkflowWakeReconciliationCli({ args: ['--once'], signals: signals as never, load: async () => ({ worker: current, close }) })
    await Promise.resolve()
    signals.emit('SIGTERM')
    finishRun()

    await running
    expect(current.stop).toHaveBeenCalledOnce()
    expect(current.drain).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
