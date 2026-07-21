/* eslint-disable @stylistic/max-statements-per-line */
import { createFlueClient, type AgentConversationObservation, type AgentPromptOptions, type FlueClient, type FlueEvent } from '@flue/sdk'
import type { AgentDispatchReceipt, AgentInvokeResult, AgentObservation, AgentObservationEvent, AgentObserveRequest, AgentRequest, AgentRuntime, AgentRuntimeCapabilities } from '@nuxt-laravelize/agent-sdk/runtime'

interface FlueConnectionOptions { readonly token?: string, readonly headers?: Record<string, string> }
export type FlueAgentRuntimeOptions = ({ readonly client: FlueClient, readonly baseUrl?: never } | { readonly client?: never, readonly baseUrl: string }) & FlueConnectionOptions
export class FlueAgentRuntime implements AgentRuntime {
  readonly capabilities: AgentRuntimeCapabilities = { invoke: true, dispatch: true, observation: 'conversation', resumable: false, observationByKind: { agent: 'conversation', workflow: 'events' }, resumableByKind: { agent: false, workflow: true } }
  readonly native: FlueClient
  constructor(options: FlueAgentRuntimeOptions) {
    if (!options.client && !options.baseUrl?.trim()) throw new TypeError('Flue requires a non-empty baseUrl or an injected client.')
    this.native = options.client ?? createFlueClient({ baseUrl: options.baseUrl, token: options.token, headers: options.headers })
  }

  async invoke<RESULT>(request: AgentRequest): Promise<AgentInvokeResult<RESULT>> {
    if (request.kind === 'workflow') { const native = await this.native.workflows.invoke(request.name, { ...(request.native as object), input: request.input, signal: request.signal, wait: 'result' }); return { result: native.result as RESULT, native } }
    const native = await this.native.agents.prompt(request.name, this.instance(request), this.promptOptions(request))
    return { result: native.result as RESULT, native }
  }

  async dispatch(request: AgentRequest): Promise<AgentDispatchReceipt> {
    if (request.kind === 'workflow') { const native = await this.native.workflows.invoke(request.name, { ...(request.native as object), input: request.input, signal: request.signal, wait: undefined }); return { id: native.runId, name: request.name, kind: 'workflow', native } }
    const native = await this.native.agents.send(request.name, this.instance(request), this.promptOptions(request))
    return { id: native.submissionId, name: request.name, kind: 'agent', instanceId: request.instanceId, offset: native.offset, native }
  }

  observe(request: AgentObserveRequest): AgentObservation {
    if (request.kind === 'workflow') return this.observeRun(request)
    if (request.offset !== undefined) throw new TypeError('Flue conversation observe does not accept an external offset; pass a native observation instead.')
    const observation = this.native.agents.observe(request.name, this.instance(request), { signal: request.signal, ...(request.native as object) })
    return this.observeConversation(observation)
  }

  private observeRun(request: AgentObserveRequest): AgentObservation {
    const runId = request.receipt?.id ?? request.instanceId
    if (!runId) throw new TypeError('Flue workflow observation requires a dispatch receipt or run instanceId.')
    const stream = this.native.runs.stream(runId, { ...(request.native as object), offset: request.offset as string | undefined, signal: request.signal })
    return { native: stream, close: reason => stream.cancel(reason), async* [Symbol.asyncIterator]() { for await (const native of stream) yield { type: native.type, payload: native, offset: stream.offset, native } as AgentObservationEvent<FlueEvent, FlueEvent> } }
  }

  private observeConversation(observation: AgentConversationObservation): AgentObservation {
    let closed = false; let changed = true; let wake: (() => void) | undefined
    const unsubscribe = observation.subscribe(() => { changed = true; wake?.() })
    const close = (reason?: unknown) => { if (closed) return; closed = true; unsubscribe(); observation.close(reason); wake?.() }
    return { native: observation, close, async* [Symbol.asyncIterator]() {
      try { while (!closed) { if (!changed) await new Promise<void>((resolve) => { wake = resolve }); wake = undefined; if (closed) break; changed = false; const native = observation.getSnapshot(); if (native.phase === 'error') throw native.error ?? new Error('Flue conversation observation failed.'); yield { type: 'conversation', payload: native.conversation, offset: native.offset, native } as AgentObservationEvent; if (native.phase === 'closed' || native.phase === 'absent') break } }
      finally { close() }
    } }
  }

  private instance(request: AgentRequest | AgentObserveRequest): string { if (!request.instanceId) throw new TypeError('Flue agent calls require an instanceId (conversation identity).'); return request.instanceId }
  private promptOptions(request: AgentRequest): AgentPromptOptions { return typeof request.input === 'string' ? { message: request.input, signal: request.signal, ...(request.native as object) } : { ...(request.input as AgentPromptOptions), signal: request.signal, ...(request.native as object) } }
}
