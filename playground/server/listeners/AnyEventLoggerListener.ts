import type { Listener } from '../../../src/events'

import type { EventProbeContract } from '../services/probeTokens'

export class AnyEventLoggerListener implements Listener<unknown> {
  readonly #probe: EventProbeContract

  constructor(probe: EventProbeContract) {
    this.#probe = probe
  }

  handle(event: unknown): void {
    const name = (event as object).constructor.name
    this.#probe.recordAny(name)
  }
}
