import { createToken } from '../../../src/core/container/Token'

export interface EventProbeContract {
  recordWelcome(userId: string): void
  recordAudit(userId: string): void
  recordAny(eventName: string): void
  snapshot(): { welcome: string[], audit: string[], any: string[] }
}

export const eventProbeToken = createToken<EventProbeContract>('playground.event-probe')
