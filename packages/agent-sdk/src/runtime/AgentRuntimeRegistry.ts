import { AgentRuntimeNotFoundError } from './errors'
import type { AgentRuntime } from './types'

export class AgentRuntimeRegistry {
  readonly #runtimes = new Map<string, AgentRuntime>()
  register(name: string, runtime: AgentRuntime): this {
    if (!name.trim()) throw new TypeError('Agent runtime name cannot be empty.')
    this.#runtimes.set(name, runtime)
    return this
  }

  get(name: string): AgentRuntime {
    const runtime = this.#runtimes.get(name)
    if (!runtime) throw new AgentRuntimeNotFoundError(name)
    return runtime
  }

  has(name: string): boolean { return this.#runtimes.has(name) }
}
