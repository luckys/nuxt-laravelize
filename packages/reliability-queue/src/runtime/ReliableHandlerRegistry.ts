import type { MessageEnvelope, MessageExecutionContext } from '@nuxt-laravelize/reliability'

export type ReliableMessageHandler = (message: MessageEnvelope, context: MessageExecutionContext) => void | Promise<void>
export class DuplicateReliableHandlerError extends Error {}
export class UnknownReliableMessageError extends Error {}
export class ReliableHandlerRegistry {
  readonly #handlers = new Map<string, ReliableMessageHandler>()
  register(type: string, version: number, handler: ReliableMessageHandler): void {
    const key = `${type}@${version}`
    if (this.#handlers.has(key)) throw new DuplicateReliableHandlerError(`Reliable handler "${key}" is already registered.`)
    this.#handlers.set(key, handler)
  }

  handler(type: string, version: number): ReliableMessageHandler {
    const key = `${type}@${version}`
    const handler = this.#handlers.get(key)
    if (!handler) throw new UnknownReliableMessageError(`Reliable message "${key}" is not registered.`)
    return handler
  }
}
