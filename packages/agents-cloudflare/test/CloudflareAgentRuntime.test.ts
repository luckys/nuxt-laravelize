import { describe, expect, it, vi } from 'vitest'
import { CloudflareAgentRuntime } from '../src/CloudflareAgentRuntime'

describe('CloudflareAgentRuntime', () => {
  it('maps invoke to RPC while preserving instance identity and native result', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true })
    const close = vi.fn()
    const runtime = new CloudflareAgentRuntime({ host: 'example.test', client: (agent, name) => ({ agent, name, call, close } as never) })
    const result = await runtime.invoke({ name: 'support', instanceId: 'tenant-1', input: { message: 'hello' } })
    expect(call).toHaveBeenCalledWith('invoke', [{ message: 'hello' }], undefined)
    expect(result.result).toEqual({ ok: true })
    expect((result.native as { client: { name: string } }).client.name).toBe('tenant-1')
  })

  it('requires a native dispatch receipt id', async () => {
    const runtime = new CloudflareAgentRuntime({ host: 'example.test', client: () => ({ call: vi.fn().mockResolvedValue({ queued: true }), close: vi.fn() } as never) })
    await expect(runtime.dispatch({ name: 'support', instanceId: 'one', input: 'hi' })).rejects.toThrow('must return an object with an id')
  })

  it('emits terminal chunks and closes completed observations', async () => {
    const close = vi.fn()
    const call = vi.fn((_method, _args, options) => {
      options.stream.onChunk('part')
      options.stream.onDone('final')
      return Promise.resolve()
    })
    const runtime = new CloudflareAgentRuntime({ host: 'example.test', client: () => ({ call, close } as never) })
    const events = []
    for await (const event of runtime.observe({ name: 'support', instanceId: 'one' })) events.push(event)
    expect(events.map(event => [event.type, event.payload])).toEqual([['cloudflare', 'part'], ['done', 'final']])
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the client when an invocation is aborted', async () => {
    const controller = new AbortController()
    const close = vi.fn()
    const runtime = new CloudflareAgentRuntime({ host: 'example.test', client: () => ({ call: vi.fn(() => new Promise(() => {})), close } as never) })
    const invocation = runtime.invoke({ name: 'support', instanceId: 'one', input: 'hello', signal: controller.signal })
    controller.abort()
    await expect(invocation).rejects.toMatchObject({ name: 'AbortError' })
    expect(close).toHaveBeenCalled()
  })
})
