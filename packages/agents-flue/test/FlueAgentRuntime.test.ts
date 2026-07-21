import { describe, expect, it, vi } from 'vitest'
import { FlueAgentRuntime } from '../src/FlueAgentRuntime'

describe('FlueAgentRuntime', () => {
  it('maps agents to conversations and preserves Flue offsets', async () => {
    const send = vi.fn().mockResolvedValue({ submissionId: 'sub-1', streamUrl: '/stream', offset: 'opaque:17' })
    const runtime = new FlueAgentRuntime({ client: { agents: { send }, workflows: {}, runs: {} } as never })
    const receipt = await runtime.dispatch({ name: 'assistant', kind: 'agent', instanceId: 'conversation-1', input: 'hello' })
    expect(send).toHaveBeenCalledWith('assistant', 'conversation-1', { message: 'hello', signal: undefined })
    expect(receipt).toMatchObject({ id: 'sub-1', instanceId: 'conversation-1', offset: 'opaque:17' })
  })

  it('keeps workflows as run state rather than conversation state', async () => {
    const invoke = vi.fn().mockResolvedValue({ runId: 'run-1' })
    const runtime = new FlueAgentRuntime({ client: { agents: {}, workflows: { invoke }, runs: {} } as never })
    const receipt = await runtime.dispatch({ name: 'research', kind: 'workflow', input: { topic: 'agents' } })
    expect(invoke).toHaveBeenCalledWith('research', { input: { topic: 'agents' }, signal: undefined, wait: undefined })
    expect(receipt).toMatchObject({ id: 'run-1', kind: 'workflow' })
  })

  it('keeps workflow wait semantics under adapter control', async () => {
    const invoke = vi.fn().mockResolvedValue({ runId: 'run-1', result: 'done' })
    const runtime = new FlueAgentRuntime({ client: { agents: {}, workflows: { invoke }, runs: {} } as never })
    await runtime.invoke({ name: 'research', kind: 'workflow', input: 'topic', native: { wait: undefined } })
    await runtime.dispatch({ name: 'research', kind: 'workflow', input: 'topic', native: { wait: 'result' } })
    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ wait: 'result' })
    expect(invoke.mock.calls[1]?.[1]).toHaveProperty('wait', undefined)
  })

  it('ends and cleans up closed conversation observations', async () => {
    const unsubscribe = vi.fn()
    const close = vi.fn()
    const observation = { subscribe: vi.fn(() => unsubscribe), close, getSnapshot: vi.fn(() => ({ phase: 'closed', conversation: {}, offset: 'opaque:1' })) }
    const runtime = new FlueAgentRuntime({ client: { agents: { observe: vi.fn(() => observation) }, workflows: {}, runs: {} } as never })
    const events = []
    for await (const event of runtime.observe({ name: 'assistant', kind: 'agent', instanceId: 'conversation-1' })) events.push(event)
    expect(events).toHaveLength(1)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects missing connection configuration', () => {
    expect(() => new FlueAgentRuntime({} as never)).toThrow('non-empty baseUrl')
  })
})
