import type { Listener } from '../../../src/events'

import type { UserRegistered } from '../events/UserRegistered'
import type { EventProbeContract } from '../services/probeTokens'

export class SendWelcomeEmailListener implements Listener<UserRegistered> {
  readonly #probe: EventProbeContract

  constructor(probe: EventProbeContract) {
    this.#probe = probe
  }

  handle(event: UserRegistered): void {
    this.#probe.recordWelcome(event.userId)
  }
}
