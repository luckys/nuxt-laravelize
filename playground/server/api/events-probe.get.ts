import { defineEventHandler } from 'h3'

import { useContainer } from '../../../src/runtime/server/utils/useContainer'
import { eventProbeToken } from '../services/probeTokens'

export default defineEventHandler((event) => {
  const container = useContainer(event)
  const probe = container.make(eventProbeToken)
  return probe.snapshot()
})
