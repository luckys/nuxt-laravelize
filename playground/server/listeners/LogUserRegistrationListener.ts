import type { Listener } from '../../../src/events'

import type { UserRegistered } from '../events/UserRegistered'
import type { EventProbeContract } from '../services/probeTokens'

export class LogUserRegistrationListener implements Listener<UserRegistered> {
  static readonly shouldQueue = true as const
  readonly #probe: EventProbeContract

  constructor(probe: EventProbeContract) {
    this.#probe = probe
  }

  handle(event: UserRegistered): void {
    this.#probe.recordAudit(event.userId)
  }
}
