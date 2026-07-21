/* eslint-disable @stylistic/max-statements-per-line */
import { AgentClient } from 'agents/client'
import type { AgentDispatchReceipt, AgentInvokeResult, AgentObservation, AgentObservationEvent, AgentObserveRequest, AgentRequest, AgentRuntime, AgentRuntimeCapabilities } from '@nuxt-laravelize/agent-sdk/runtime'

type CloudflareClient = Pick<AgentClient, 'agent' | 'name' | 'call' | 'close'>
export interface CloudflareAgentRuntimeOptions {
  readonly host: string
  readonly invokeMethod?: string
  readonly dispatchMethod?: string
  readonly observeMethod?: string
  readonly client?: (agent: string, instanceId: string) => CloudflareClient
}

export class CloudflareAgentRuntime implements AgentRuntime {
  readonly capabilities: AgentRuntimeCapabilities = { invoke: true, dispatch: true, observation: 'events', resumable: false }
  readonly native: CloudflareAgentRuntimeOptions
  constructor(private readonly options: CloudflareAgentRuntimeOptions) { this.native = options }
  async invoke<RESULT>(request: AgentRequest): Promise<AgentInvokeResult<RESULT>> {
    const client = this.client(request)
    try { const result = await this.call<RESULT>(client, request, this.method(request, 'invokeMethod', 'invoke'), [request.input], request.native as never); return { result, native: { client, result } } }
    finally { client.close() }
  }

  async dispatch(request: AgentRequest): Promise<AgentDispatchReceipt> {
    const client = this.client(request)
    try {
      const native = await this.call<unknown>(client, request, this.method(request, 'dispatchMethod', 'dispatch'), [request.input], request.native as never)
      const receipt = native as { id?: string, offset?: unknown }
      if (!receipt?.id) throw new TypeError('Cloudflare dispatch RPC must return an object with an id.')
      return { id: receipt.id, name: request.name, instanceId: request.instanceId, kind: request.kind, offset: receipt.offset, native }
    }
    finally { client.close() }
  }

  observe(request: AgentObserveRequest): AgentObservation {
    const client = this.client(request)
    const events: AgentObservationEvent[] = []
    let done = false
    let wake: (() => void) | undefined
    const finalize = () => { if (done) return; done = true; client.close(); wake?.() }
    const push = (type: string, native: unknown) => { events.push({ type, payload: native, native }); wake?.() }
    const stream = { onChunk: (native: unknown) => push('cloudflare', native), onDone: (native: unknown) => { if (native !== undefined) push('done', native); finalize() }, onError: (error: string) => { push('error', error); finalize() } }
    const abort = () => { push('error', request.signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError')); finalize() }
    if (request.signal?.aborted) abort()
    else request.signal?.addEventListener('abort', abort, { once: true })
    if (!done) void client.call(this.method(request, 'observeMethod', 'observe'), [request.receipt?.native ?? request.offset], { stream }).catch((error) => { push('error', error); finalize() })
    const close = () => { request.signal?.removeEventListener('abort', abort); finalize() }
    return { native: client, close, async* [Symbol.asyncIterator]() {
      try { while (!done || events.length) { if (!events.length) await new Promise<void>((resolve) => { wake = resolve }); wake = undefined; const event = events.shift(); if (event) yield event } }
      finally { close() }
    } }
  }

  private client(request: AgentRequest | AgentObserveRequest): CloudflareClient {
    if (!request.instanceId) throw new TypeError('Cloudflare Agents requires an instanceId to preserve Durable Object identity.')
    return this.options.client?.(request.name, request.instanceId) ?? new AgentClient({ host: this.options.host, agent: request.name, name: request.instanceId })
  }

  private method(request: AgentRequest | AgentObserveRequest, key: 'invokeMethod' | 'dispatchMethod' | 'observeMethod', fallback: string): string { return (request.native as { method?: string } | undefined)?.method ?? this.options[key] ?? fallback }

  private async call<RESULT>(client: CloudflareClient, request: AgentRequest, method: string, args: unknown[], options: never): Promise<RESULT> {
    if (request.signal?.aborted) throw request.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
    let abort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => { abort = () => { client.close(); reject(request.signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError')) }; request.signal?.addEventListener('abort', abort, { once: true }) })
    try { return await Promise.race([client.call<RESULT>(method, args, options), aborted]) }
    finally { if (abort) request.signal?.removeEventListener('abort', abort) }
  }
}
