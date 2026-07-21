import { describe, expect, it } from 'vitest'
import { AgentRuntimeRegistry, AgentSdkClient, defineAgent } from '../src/runtime'
import { AgentFake } from '../src/runtime/testing'

describe('AgentSdkClient', () => {
  it('keeps runtime-native results and instance identity', async () => {
    const fake = new AgentFake([{ result: { answer: 42 }, native: { provider: 'fake' } }])
    const client = new AgentSdkClient(new AgentRuntimeRegistry().register('test', fake), 'test')
    const agent = defineAgent<{ tenant: string }, number>({ name: 'answerer', instanceId: input => input.tenant, mapInput: () => 'question', mapResult: result => (result as { answer: number }).answer })
    await expect(agent.invoke(client, { tenant: 'acme' })).resolves.toEqual({ result: 42, native: { provider: 'fake' } })
    expect(fake.requests[0]).toMatchObject({ name: 'answerer', instanceId: 'acme', input: 'question' })
  })

  it('preserves opaque offsets while observing', async () => {
    const offset = { opaque: true }
    const fake = new AgentFake([{ events: [{ type: 'delta', payload: 'ok', offset, native: { chunk: 1 } }] }])
    const client = new AgentSdkClient(new AgentRuntimeRegistry().register('test', fake), 'test')
    const observation = defineAgent<unknown>({ name: 'worker' }).observe(client, { offset })
    const events = []
    for await (const event of observation) events.push(event)
    expect(events[0]?.offset).toBe(offset)
    expect(fake.observations[0]?.offset).toBe(offset)
  })

  it('resumes observation with the dispatch receipt identity', async () => {
    const fake = new AgentFake([{ receipt: { id: 'job-1' } }, { events: [] }])
    const client = new AgentSdkClient(new AgentRuntimeRegistry().register('test', fake), 'test')
    const agent = defineAgent<{ tenant: string }>({ name: 'worker', instanceId: input => input.tenant })
    const receipt = await agent.dispatch(client, { tenant: 'acme' })
    agent.observe(client, { receipt })
    expect(fake.observations[0]?.instanceId).toBe('acme')
  })

  it.each([null, undefined])('preserves mapped %s inputs', async (mapped) => {
    const fake = new AgentFake([{ result: 'ok' }])
    const client = new AgentSdkClient(new AgentRuntimeRegistry().register('test', fake), 'test')
    const agent = defineAgent<string>({ name: 'mapper', mapInput: () => mapped })
    await agent.invoke(client, 'original')
    expect(fake.requests[0]?.input).toBe(mapped)
  })
})
