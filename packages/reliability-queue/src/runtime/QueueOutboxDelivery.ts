import { createHash } from 'node:crypto'
import type { Queue } from '@nuxt-laravelize/queue/runtime'
import { sanitizeErrorSummary, type DeliveryResult, type MessageEnvelope } from '@nuxt-laravelize/reliability'
import { ReliableMessageJob } from './ReliableMessageJob'

export type QueueOutboxDeliveryOptions = { queue?: string, retryDelayMs?: number }
export const createQueueOutboxDelivery = (queue: Queue, options: string | QueueOutboxDeliveryOptions = {}) => async (message: MessageEnvelope): Promise<DeliveryResult> => {
  try {
    const resolved = typeof options === 'string' ? { queue: options } : options
    const retryDelayMs = resolved.retryDelayMs ?? ReliableMessageJob.backoff
    const id = `outbox-${createHash('sha256').update(message.id).digest('hex')}`
    await queue.push(new ReliableMessageJob({ envelope: message, retryDelayMs }), { id, backoff: retryDelayMs, ...(resolved.queue ? { queue: resolved.queue } : {}) })
    return { ok: true }
  }
  catch (error) { return { ok: false, retryable: !(error instanceof TypeError), error: sanitizeErrorSummary(error, 'queue_publication_failed') } }
}
