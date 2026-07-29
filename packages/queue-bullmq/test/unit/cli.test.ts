import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { parseQueueWorkerArguments, runQueueWorkerCli } from '../../src/cli'

describe('queue worker CLI', () => {
  it('parses and validates worker options', () => {
    expect(parseQueueWorkerArguments(['--queue=mail', '--concurrency=3', '--config=worker.mjs'])).toEqual({ queue: 'mail', concurrency: 3, config: 'worker.mjs', help: false })
    expect(() => parseQueueWorkerArguments(['--concurrency=0'])).toThrow(/between 1 and 100/)
    expect(() => parseQueueWorkerArguments(['--concurrency=101'])).toThrow(/between 1 and 100/)
    expect(() => parseQueueWorkerArguments(['--wat'])).toThrow(/Unknown/)
  })

  it('stops and closes once when signals race', async () => {
    const signals = new EventEmitter()
    const worker = { work: vi.fn(async () => {}), stop: vi.fn(async () => {}) }
    const close = vi.fn(async () => {})
    const running = runQueueWorkerCli({ args: [], signals: signals as never, load: async () => ({ worker, close }) })
    await new Promise(resolve => setTimeout(resolve, 0))
    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    await running
    expect(worker.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('closes producer resources only after active worker drain resolves', async () => {
    const signals = new EventEmitter()
    let release!: () => void
    const draining = new Promise<void>((resolve) => {
      release = resolve
    })
    const worker = { work: vi.fn(async () => {}), stop: vi.fn(() => draining) }
    const close = vi.fn(async () => {})
    const running = runQueueWorkerCli({ args: [], signals: signals as never, load: async () => ({ worker, close }) })
    await new Promise(resolve => setTimeout(resolve, 0))

    signals.emit('SIGTERM')
    await Promise.resolve()
    expect(worker.stop).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()

    release()
    await running
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes resources even when worker stop rejects', async () => {
    const signals = new EventEmitter()
    const worker = { work: vi.fn(async () => {}), stop: vi.fn(async () => {
      throw new Error('stop failed')
    }) }
    const close = vi.fn(async () => {})
    const running = runQueueWorkerCli({ args: [], signals: signals as never, load: async () => ({ worker, close }) })
    await new Promise(resolve => setTimeout(resolve, 0))
    signals.emit('SIGTERM')
    await expect(running).rejects.toThrow('stop failed')
    expect(close).toHaveBeenCalledOnce()
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('preserves both drain and producer cleanup failures', async () => {
    const signals = new EventEmitter()
    const stopError = new Error('stop failed')
    const closeError = new Error('close failed')
    const worker = { work: vi.fn(async () => {}), stop: vi.fn().mockRejectedValue(stopError) }
    const close = vi.fn().mockRejectedValue(closeError)
    const running = runQueueWorkerCli({ args: [], signals: signals as never, load: async () => ({ worker, close }) })
    await new Promise(resolve => setTimeout(resolve, 0))

    signals.emit('SIGTERM')
    const failure = await running.catch(error => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([stopError, closeError])
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('preserves undefined promise rejection reasons', async () => {
    const signals = new EventEmitter()
    const worker = { work: vi.fn(async () => {}), stop: vi.fn().mockRejectedValue(undefined) }
    const running = runQueueWorkerCli({ args: [], signals: signals as never, load: async () => ({ worker }) })
    await new Promise(resolve => setTimeout(resolve, 0))

    signals.emit('SIGTERM')
    const result = await running.then(() => ({ resolved: true }), error => ({ resolved: false, error }))

    expect(result).toEqual({ resolved: false, error: undefined })
  })
})
