import { describe, expect, it } from 'vitest'

import { BullMQNotInstalledError, EventNotRegisteredError, JobNotRegisteredError } from '../../src/queue/errors'

describe('queue errors', () => {
  it('JobNotRegisteredError includes the missing name', () => {
    const err = new JobNotRegisteredError('FooJob')
    expect(err.name).toBe('JobNotRegisteredError')
    expect(err.message).toContain('FooJob')
  })

  it('EventNotRegisteredError includes the missing name', () => {
    const err = new EventNotRegisteredError('UserRegistered')
    expect(err.name).toBe('EventNotRegisteredError')
    expect(err.message).toContain('UserRegistered')
  })

  it('BullMQNotInstalledError documents the required peer deps', () => {
    const err = new BullMQNotInstalledError()
    expect(err.name).toBe('BullMQNotInstalledError')
    expect(err.message).toContain('bullmq')
    expect(err.message).toContain('ioredis')
  })
})
