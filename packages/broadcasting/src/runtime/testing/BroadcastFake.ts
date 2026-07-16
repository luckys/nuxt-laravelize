import type { BroadcastMessage, Broadcaster } from '../Broadcasting'
import { validateMessage } from '../Broadcasting'

export class BroadcastFake implements Broadcaster {
  readonly sent: BroadcastMessage[] = []
  async broadcast(message: BroadcastMessage): Promise<void> { this.sent.push(validateMessage(message)) }
  assertBroadcast(event: string, predicate: (message: BroadcastMessage) => boolean = () => true): void { if (!this.sent.some(message => message.event === event && predicate(message))) throw new Error(`Expected broadcast "${event}" was not sent.`) }
  assertNothingBroadcast(): void { if (this.sent.length) throw new Error(`Expected no broadcasts, received ${this.sent.length}.`) }
}
