import { describe, expect, it } from 'vitest'

import { createContainer } from '../../src/core/container/Container'
import { InMemoryDispatcher } from '../../src/events/InMemoryDispatcher'
import { InMemoryQueue } from '../../src/queue/InMemoryQueue'
import { Job } from '../../src/queue/Job'
import { loggerToken } from '../../src/logging/LoggerToken'
import type { Logger } from '../../src/logging/Logger'

function recordingLogger(): { logger: Logger; events: Array<{ level: string; message: string; context: unknown }> } {
  const events: Array<{ level: string; message: string; context: unknown }> = []
  const logger: Logger = {
    debug: (m, c) => events.push({ level: 'debug', message: m, context: c }),
    info: (m, c) => events.push({ level: 'info', message: m, context: c }),
    warn: (m, c) => events.push({ level: 'warn', message: m, context: c }),
    error: (m, c) => events.push({ level: 'error', message: m, context: c }),
    critical: (m, c) => events.push({ level: 'critical', message: m, context: c }),
  }
  return { logger, events }
}

class FailingJob extends Job {
  override async handle(): Promise<void> {
    throw new Error('intentional failure')
  }

  override serialize(): { name: string, args: readonly unknown[] } {
    return { name: 'FailingJob', args: [] }
  }
}

describe('InMemoryQueue wiring with logger', () => {
  it('logs a failed job through the registered logger', async () => {
    const { logger, events } = recordingLogger()
    const container = createContainer()
    container.instance(loggerToken, logger)

    const queue = new InMemoryQueue(container)
    await queue.push(new FailingJob())
    await new Promise((r) => setTimeout(r, 30))

    const errorEvent = events.find((e) => e.level === 'error' && e.message === 'queue job failed')
    expect(errorEvent).toBeDefined()
    expect((errorEvent!.context as { jobName: string }).jobName).toBe('FailingJob')
  })

  it('falls back silently when no logger is registered', async () => {
    const container = createContainer()
    const queue = new InMemoryQueue(container)
    await expect(queue.push(new FailingJob())).resolves.toBeDefined()
  })
})

describe('InMemoryDispatcher wiring with logger', () => {
  it('exposes the dispatcher constructor for downstream tests', () => {
    const container = createContainer()
    expect(() => new InMemoryDispatcher(container)).not.toThrow()
  })
})
