import { describe, expect, it, vi } from 'vitest'

import { FailureReporter } from '../../src/runtime/FailureReporter'

describe('FailureReporter', () => {
  it('isolates observers so every failure callback runs', async () => {
    const reporter = new FailureReporter()
    const observed = vi.fn()
    reporter.listen(() => {
      throw new Error('observer failed')
    })
    reporter.listen(observed)

    await reporter.report({
      job: {} as never,
      queue: 'default',
      error: new Error('job failed'),
      attempts: 1,
    })

    expect(observed).toHaveBeenCalledOnce()
  })
})
