import { defineEventHandler } from 'h3'

import { useContainer } from '../../../src/runtime/server/utils/useContainer'

import { jobProbeToken } from '../services/jobProbeTokens'

export default defineEventHandler((event) => {
  const container = useContainer(event)
  const probe = container.make(jobProbeToken)
  return probe.snapshot()
})
