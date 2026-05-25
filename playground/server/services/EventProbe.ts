import type { EventProbeContract } from './probeTokens'

export class EventProbe implements EventProbeContract {
  readonly #welcome: string[] = []
  readonly #audit: string[] = []
  readonly #any: string[] = []

  recordWelcome(userId: string): void {
    this.#welcome.push(userId)
  }

  recordAudit(userId: string): void {
    this.#audit.push(userId)
  }

  recordAny(eventName: string): void {
    this.#any.push(eventName)
  }

  snapshot(): { welcome: string[], audit: string[], any: string[] } {
    return {
      welcome: [...this.#welcome],
      audit: [...this.#audit],
      any: [...this.#any],
    }
  }
}
