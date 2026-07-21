import { AgentCapabilityNotSupportedError } from './errors'
import type { AgentRuntimeRegistry } from './AgentRuntimeRegistry'
import type { AgentCallOptions, AgentClient, AgentDispatchReceipt, AgentInvokeResult, AgentObservation, AgentObserveOptions, AgentRuntime, AgentRuntimeCapabilities, DefinedAgent } from './types'

export class AgentSdkClient implements AgentClient {
  constructor(private readonly runtimes: AgentRuntimeRegistry, private readonly defaultRuntime: string) {}
  capabilities(runtime = this.defaultRuntime): AgentRuntimeCapabilities { return this.runtimes.get(runtime).capabilities }
  raw(runtime = this.defaultRuntime): AgentRuntime { return this.runtimes.get(runtime) }
  async invoke<INPUT, RESULT>(definition: DefinedAgent<INPUT, RESULT>, input: INPUT, options: AgentCallOptions = {}): Promise<AgentInvokeResult<RESULT>> {
    const [, runtime] = this.resolve(definition.runtime, options.runtime, 'invoke')
    const native = await runtime.invoke({ name: definition.name, kind: definition.kind, instanceId: this.instanceId(definition, input, options), input: definition.mapInput ? definition.mapInput(input) : input, signal: options.signal, native: options.native ?? definition.native })
    return { result: definition.mapResult ? definition.mapResult(native.result, native.native) : native.result as RESULT, native: native.native }
  }

  dispatch<INPUT>(definition: DefinedAgent<INPUT, unknown>, input: INPUT, options: AgentCallOptions = {}): Promise<AgentDispatchReceipt> {
    const [, runtime] = this.resolve(definition.runtime, options.runtime, 'dispatch')
    return runtime.dispatch({ name: definition.name, kind: definition.kind, instanceId: this.instanceId(definition, input, options), input: definition.mapInput ? definition.mapInput(input) : input, signal: options.signal, native: options.native ?? definition.native })
  }

  observe(definition: DefinedAgent<unknown, unknown>, options: AgentObserveOptions = {}): AgentObservation {
    const [runtimeName, runtime] = this.resolve(definition.runtime, options.runtime, 'observation')
    const kind = definition.kind ?? 'agent'
    if (runtime.capabilities.observationByKind?.[kind] === 'none') throw new AgentCapabilityNotSupportedError(runtimeName, `${kind} observation`)
    const resumable = runtime.capabilities.resumableByKind?.[kind] ?? runtime.capabilities.resumable
    if (options.offset !== undefined && !resumable) throw new AgentCapabilityNotSupportedError(runtimeName, `${kind} observation resume`)
    const definedInstance = typeof definition.instanceId === 'string' ? definition.instanceId : undefined
    return runtime.observe({ name: definition.name, kind: definition.kind, instanceId: options.instanceId ?? options.receipt?.instanceId ?? definedInstance, receipt: options.receipt, offset: options.offset, signal: options.signal, native: options.native ?? definition.native })
  }

  private resolve(preferred: string | undefined, override: string | undefined, capability: 'invoke' | 'dispatch' | 'observation'): [string, AgentRuntime] {
    const name = override ?? preferred ?? this.defaultRuntime
    const runtime = this.runtimes.get(name)
    const supported = capability === 'observation' ? runtime.capabilities.observation !== 'none' : runtime.capabilities[capability]
    if (!supported) throw new AgentCapabilityNotSupportedError(name, capability)
    return [name, runtime]
  }

  private instanceId<INPUT>(definition: DefinedAgent<INPUT, unknown>, input: INPUT, options: AgentCallOptions): string | undefined { return options.instanceId ?? (typeof definition.instanceId === 'function' ? definition.instanceId(input) : definition.instanceId) }
}
