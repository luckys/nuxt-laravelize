import type { Resolver } from '@nuxt-laravelize/core/runtime'
import { Job } from '@nuxt-laravelize/queue/runtime'
import { ConsumerFailure, InboxConsumer, createEnvelope, type MessageEnvelope } from '@nuxt-laravelize/reliability'
import { inboxStoreToken, reliableHandlerRegistryToken } from './tokens'
import { UnknownReliableMessageError } from './ReliableHandlerRegistry'

export class QueueRetryError extends Error {
  constructor(readonly retryAt?: string) {
    super('Reliable message must be retried')
  }
}
export class ReliableMessageJob extends Job<{ envelope: MessageEnvelope, retryDelayMs?: number }> {
  static override readonly jobName = 'nuxt-laravelize.reliable-message.v1'
  static override readonly tries = 100
  static override readonly backoff = 5000
  readonly payload: { envelope: MessageEnvelope, retryDelayMs?: number }
  constructor(payload: Record<string, unknown>) {
    super()
    if (!payload.envelope || typeof payload.envelope !== 'object') throw new TypeError('ReliableMessageJob requires an envelope')
    const retryDelayMs = payload.retryDelayMs ?? ReliableMessageJob.backoff
    if (!Number.isSafeInteger(retryDelayMs) || Number(retryDelayMs) < 1000 || Number(retryDelayMs) > 86_400_000) throw new TypeError('retryDelayMs must be an integer between 1000 and 86400000')
    this.payload = { envelope: createEnvelope(payload.envelope as MessageEnvelope), retryDelayMs: Number(retryDelayMs) }
  }

  async handle(resolver: Resolver): Promise<void> {
    const message = this.payload.envelope
    const registry = resolver.make(reliableHandlerRegistryToken)
    const consumer = new InboxConsumer(resolver.make(inboxStoreToken), async (value, context) => {
      try {
        await registry.handler(value.type, value.version)(value, context!)
      }
      catch (error) {
        if (error instanceof ConsumerFailure) throw error
        if (error instanceof UnknownReliableMessageError) throw new ConsumerFailure(error.message, false)
        throw error
      }
    }, { owner: ReliableMessageJob.jobName, retryDelayMs: () => this.payload.retryDelayMs! })
    const result = await consumer.consume(message)
    if (result === 'busy' || result === 'retry') throw new QueueRetryError()
  }
}
