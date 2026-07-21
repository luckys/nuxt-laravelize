import { AgentFakeResponseMissingError } from '../errors'
import type { AgentDispatchReceipt, AgentInvokeResult, AgentObservation, AgentObservationEvent, AgentObserveRequest, AgentRequest, AgentRuntime, AgentRuntimeCapabilities } from '../types'

export interface AgentFakeResponse { readonly result?: unknown, readonly events?: readonly AgentObservationEvent[], readonly receipt?: Partial<AgentDispatchReceipt>, readonly native?: unknown }

export class AgentFake implements AgentRuntime {
  readonly capabilities: AgentRuntimeCapabilities = { invoke: true, dispatch: true, observation: 'events', resumable: true }
  readonly native = this
  readonly requests: AgentRequest[] = []
  readonly observations: AgentObserveRequest[] = []
  readonly #responses: AgentFakeResponse[] = []

  constructor(responses: readonly AgentFakeResponse[] = []) {
    this.#responses.push(...responses)
  }

  respond(response: AgentFakeResponse): this {
    this.#responses.push(response)
    return this
  }

  async invoke<RESULT>(request: AgentRequest): Promise<AgentInvokeResult<RESULT>> {
    this.requests.push(request)
    const response = this.next()
    return { result: response.result as RESULT, native: response.native ?? response }
  }

  async dispatch(request: AgentRequest): Promise<AgentDispatchReceipt> {
    this.requests.push(request)
    const response = this.next()
    return { id: response.receipt?.id ?? `fake-${this.requests.length}`, name: request.name, kind: request.kind, instanceId: request.instanceId, offset: response.receipt?.offset, native: response.receipt?.native ?? response.native ?? response }
  }

  observe(request: AgentObserveRequest): AgentObservation {
    this.observations.push(request)
    const response = this.next()
    let closed = false
    return {
      native: response.native ?? response,
      close: () => { closed = true },
      async* [Symbol.asyncIterator]() {
        for (const event of response.events ?? []) {
          if (closed) break
          yield event
        }
      },
    }
  }

  assertRequestCount(count: number): void {
    if (this.requests.length !== count) throw new Error(`Expected ${count} agent requests, received ${this.requests.length}.`)
  }

  assertNothingRequested(): void {
    this.assertRequestCount(0)
  }

  private next(): AgentFakeResponse {
    const response = this.#responses.shift()
    if (!response) throw new AgentFakeResponseMissingError()
    return response
  }
}
