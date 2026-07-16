import type { Broadcaster, BroadcastMessage } from './Broadcasting'
import { validateMessage } from './Broadcasting'

export class InMemoryBroadcaster implements Broadcaster {
  readonly #messages: BroadcastMessage[] = []
  constructor(readonly capacity = 100) { if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000) throw new RangeError('Memory capacity must be between 1 and 10000.') }
  async broadcast(message: BroadcastMessage): Promise<void> {
    this.#messages.push(validateMessage(message))
    if (this.#messages.length > this.capacity) this.#messages.shift()
  }

  messages(): readonly BroadcastMessage[] { return [...this.#messages] }
}
