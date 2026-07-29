import { DelayedError, UnrecoverableError } from 'bullmq'
import { JobReleasedError, NonRetryableJobError, type JobRunner } from '@nuxt-laravelize/queue/runtime'
import { describe, expect, it, vi } from 'vitest'
import { isTerminalBullMQFailure, processBullMQJob, toBullMQJobError } from '../../src/runtime/BullMQWorker'

describe('toBullMQJobError', () => {
  it('maps portable terminal errors to BullMQ unrecoverable errors without leaking details', () => {
    const mapped = toBullMQJobError(new NonRetryableJobError('TENANT_MISMATCH', 'tenant secret-value'))
    expect(mapped).toBeInstanceOf(UnrecoverableError)
    expect((mapped as Error).message).toBe('[TENANT_MISMATCH] Non-retryable job failure')
  })

  it('preserves retryable errors', () => {
    const error = new Error('temporary')
    expect(toBullMQJobError(error)).toBe(error)
  })

  it('does not classify delayed releases as terminal failures', () => {
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 1 } }, { name: 'DelayedError' } as Error)).toBe(false)
  })

  it('moves portable releases to delayed without mapping them as failures', async () => {
    const runner = { run: vi.fn().mockRejectedValue(new JobReleasedError(2500)) } as unknown as JobRunner
    const job = { data: { version: 1, name: 'Probe', payload: {} }, attemptsMade: 0, opts: { attempts: 3 }, moveToDelayed: vi.fn().mockResolvedValue(undefined) }

    await expect(processBullMQJob(runner, job as never, 'critical', 'worker-token', () => 1000)).rejects.toBeInstanceOf(DelayedError)

    expect(job.moveToDelayed).toHaveBeenCalledWith(3500, 'worker-token')
    expect(runner.run).toHaveBeenCalledWith(job.data, { queue: 'critical', attempt: 1, maxAttempts: 3 })
  })

  it('preserves move-to-delayed failures and enforces release budgets', async () => {
    const moveError = new Error('stale worker lock')
    const runner = { run: vi.fn().mockRejectedValue(new JobReleasedError(100, 1)) } as unknown as JobRunner
    const moving = { data: { version: 1, name: 'Probe', payload: {} }, attemptsMade: 0, attemptsStarted: 1, opts: { attempts: 3 }, moveToDelayed: vi.fn().mockRejectedValue(moveError) }
    await expect(processBullMQJob(runner, moving as never, 'critical', 'token')).rejects.toBe(moveError)

    const exhausted = { ...moving, attemptsStarted: 2, moveToDelayed: vi.fn() }
    await expect(processBullMQJob(runner, exhausted as never, 'critical', 'token')).rejects.toBeInstanceOf(UnrecoverableError)
    expect(exhausted.moveToDelayed).not.toHaveBeenCalled()

    const stalled = { ...moving, attemptsStarted: 2, stalledCounter: 1, moveToDelayed: vi.fn().mockResolvedValue(undefined) }
    await expect(processBullMQJob(runner, stalled as never, 'critical', 'token')).rejects.toBeInstanceOf(DelayedError)
    expect(stalled.moveToDelayed).toHaveBeenCalledOnce()
  })

  it('treats an unrecoverable first attempt as terminal for failure reporting', () => {
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new UnrecoverableError('terminal'))).toBe(true)
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new Error('temporary'))).toBe(false)
  })
})
