import type { AiCapabilities, AiConnection } from './types'
import { AiConnectionNotFoundError } from './errors'

const defaultCapabilities: AiCapabilities = {
  streaming: true,
  structuredOutput: true,
  tools: true,
}

export class AiConnectionRegistry {
  readonly #connections = new Map<string, AiConnection>()

  register(name: string, connection: AiConnection): this {
    if (!name.trim()) throw new TypeError('AI connection name cannot be empty.')
    if (!connection.defaultModel.trim()) throw new TypeError(`AI connection "${name}" must define a default model.`)
    this.#connections.set(name, connection)
    return this
  }

  get(name: string): AiConnection {
    const connection = this.#connections.get(name)
    if (!connection) throw new AiConnectionNotFoundError(name)
    return connection
  }

  capabilities(name: string): AiCapabilities {
    return { ...defaultCapabilities, ...this.get(name).capabilities }
  }

  has(name: string): boolean {
    return this.#connections.has(name)
  }
}
