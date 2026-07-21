export type AgentKind = 'agent' | 'workflow'

export interface AgentRuntimeCapabilities {
  readonly invoke: boolean
  readonly dispatch: boolean
  readonly observation: 'none' | 'events' | 'conversation' | 'state'
  readonly resumable: boolean
  readonly observationByKind?: Readonly<Partial<Record<AgentKind, 'none' | 'events' | 'conversation' | 'state'>>>
  readonly resumableByKind?: Readonly<Partial<Record<AgentKind, boolean>>>
}

export interface AgentTarget {
  readonly name: string
  readonly instanceId?: string
  readonly kind?: AgentKind
}

export interface AgentRequest<INPUT = unknown> extends AgentTarget {
  readonly input: INPUT
  readonly signal?: AbortSignal
  readonly native?: unknown
}

export interface AgentInvokeResult<RESULT = unknown, NATIVE = unknown> {
  readonly result: RESULT
  readonly native: NATIVE
}

export interface AgentDispatchReceipt<NATIVE = unknown> extends AgentTarget {
  readonly id: string
  readonly offset?: unknown
  readonly native: NATIVE
}

export interface AgentObservationEvent<PAYLOAD = unknown, NATIVE = unknown> {
  readonly type: string
  readonly payload: PAYLOAD
  readonly offset?: unknown
  readonly native: NATIVE
}

export interface AgentObserveRequest extends AgentTarget {
  readonly receipt?: AgentDispatchReceipt
  readonly offset?: unknown
  readonly signal?: AbortSignal
  readonly native?: unknown
}

export interface AgentObservation<EVENT extends AgentObservationEvent = AgentObservationEvent, NATIVE = unknown> extends AsyncIterable<EVENT> {
  readonly native: NATIVE
  close(reason?: unknown): void
}

export interface AgentRuntime {
  readonly capabilities: AgentRuntimeCapabilities
  readonly native: unknown
  invoke<RESULT = unknown>(request: AgentRequest): Promise<AgentInvokeResult<RESULT>>
  dispatch(request: AgentRequest): Promise<AgentDispatchReceipt>
  observe(request: AgentObserveRequest): AgentObservation
}

export interface AgentClient {
  capabilities(runtime?: string): AgentRuntimeCapabilities
  invoke<INPUT, RESULT>(definition: DefinedAgent<INPUT, RESULT>, input: INPUT, options?: AgentCallOptions): Promise<AgentInvokeResult<RESULT>>
  dispatch<INPUT>(definition: DefinedAgent<INPUT, unknown>, input: INPUT, options?: AgentCallOptions): Promise<AgentDispatchReceipt>
  observe(definition: DefinedAgent<unknown, unknown>, options?: AgentObserveOptions): AgentObservation
  raw(runtime?: string): AgentRuntime
}

export interface AgentCallOptions { readonly runtime?: string, readonly instanceId?: string, readonly signal?: AbortSignal, readonly native?: unknown }
export interface AgentObserveOptions extends Omit<AgentCallOptions, 'signal'> { readonly receipt?: AgentDispatchReceipt, readonly offset?: unknown, readonly signal?: AbortSignal }

export interface AgentDefinition<INPUT, RESULT = unknown> {
  readonly name: string
  readonly kind?: AgentKind
  readonly runtime?: string
  readonly instanceId?: string | ((input: INPUT) => string | undefined)
  readonly native?: unknown
  mapInput?(input: INPUT): unknown
  mapResult?(result: unknown, native: unknown): RESULT
}

export interface DefinedAgent<INPUT, RESULT = unknown> extends AgentDefinition<INPUT, RESULT> {
  invoke(client: AgentClient, input: INPUT, options?: AgentCallOptions): Promise<AgentInvokeResult<RESULT>>
  dispatch(client: AgentClient, input: INPUT, options?: AgentCallOptions): Promise<AgentDispatchReceipt>
  observe(client: AgentClient, options?: AgentObserveOptions): AgentObservation
}
