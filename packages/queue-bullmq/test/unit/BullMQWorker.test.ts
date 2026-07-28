import { UnrecoverableError } from 'bullmq'
import { NonRetryableJobError } from '@nuxt-laravelize/queue/runtime'
import { describe, expect, it } from 'vitest'
import { isTerminalBullMQFailure, toBullMQJobError } from '../../src/runtime/BullMQWorker'

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

  it('treats an unrecoverable first attempt as terminal for failure reporting', () => {
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new UnrecoverableError('terminal'))).toBe(true)
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new Error('temporary'))).toBe(false)
  })
})
