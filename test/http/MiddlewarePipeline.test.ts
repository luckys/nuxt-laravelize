import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import type { Middleware } from '../../src/http/Middleware'
import { runMiddlewarePipeline } from '../../src/http/MiddlewarePipeline'

function createMockEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

describe('runMiddlewarePipeline', () => {
  it('runs terminal directly when the pipeline is empty', async () => {
    const result = await runMiddlewarePipeline(createMockEvent(), [], async () => 'terminal-value')

    expect(result).toBe('terminal-value')
  })

  it('passes through a single middleware that calls next', async () => {
    const middleware: Middleware = {
      async handle(_event, next) {
        return await next()
      },
    }

    const result = await runMiddlewarePipeline(createMockEvent(), [middleware], async () => 'terminal-value')

    expect(result).toBe('terminal-value')
  })

  it('executes multiple middlewares in declaration order then the terminal', async () => {
    const events: string[] = []

    const first: Middleware = {
      async handle(_event, next) {
        events.push('first:before')
        const value = await next()
        events.push('first:after')
        return value
      },
    }

    const second: Middleware = {
      async handle(_event, next) {
        events.push('second:before')
        const value = await next()
        events.push('second:after')
        return value
      },
    }

    await runMiddlewarePipeline(createMockEvent(), [first, second], async () => {
      events.push('terminal')
      return undefined
    })

    expect(events).toEqual([
      'first:before',
      'second:before',
      'terminal',
      'second:after',
      'first:after',
    ])
  })

  it('short-circuits the pipeline when a middleware does not call next', async () => {
    let terminalCalled = false

    const blocker: Middleware = {
      handle() {
        return 'blocked'
      },
    }

    const result = await runMiddlewarePipeline(createMockEvent(), [blocker], async () => {
      terminalCalled = true
      return 'terminal'
    })

    expect(result).toBe('blocked')
    expect(terminalCalled).toBe(false)
  })

  it('preserves modifications to the response after next() (around pattern)', async () => {
    const wrapper: Middleware = {
      async handle(_event, next) {
        const value = await next() as { value: string }
        return { value: `${value.value}-wrapped` }
      },
    }

    const result = await runMiddlewarePipeline(createMockEvent(), [wrapper], async () => ({ value: 'raw' }))

    expect(result).toEqual({ value: 'raw-wrapped' })
  })

  it('throws when a middleware calls next() twice', async () => {
    const buggy: Middleware = {
      async handle(_event, next) {
        await next()
        await next()
      },
    }

    await expect(runMiddlewarePipeline(createMockEvent(), [buggy], async () => 'terminal')).rejects.toThrow(/next\(\) called multiple times/)
  })
})
