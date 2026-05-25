import { defineEventHandler, readBody } from 'h3'

import { useContainer } from '../../../../src/runtime/server/utils/useContainer'
import { queueToken } from '../../../../src/queue/QueueToken'
import { ProcessVideoJob } from '../../jobs/ProcessVideoJob'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ videoId: string }>(event)
  if (typeof body?.videoId !== 'string' || body.videoId.length === 0) {
    return { error: 'videoId required' }
  }
  const container = useContainer(event)
  const queue = container.make(queueToken)
  const handle = await queue.push(new ProcessVideoJob(body.videoId))
  return { jobId: handle.id, queue: handle.queue }
})
