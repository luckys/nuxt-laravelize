import type { Resolver } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { Job, jobRegistryToken, type InMemoryJobRegistry } from '@nuxt-laravelize/queue/runtime'

class ObserveQueueContextJob extends Job<{ observed: { correlationId?: string } }> {
  readonly payload: { observed: { correlationId?: string } }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { observed: { correlationId?: string } }
  }

  handle(resolver: Resolver): void {
    this.payload.observed.correlationId = resolver.make(executionContextToken).snapshot().correlationId
  }
}

export default defineEventHandler(async (event) => {
  const observed: { correlationId?: string } = {}
  const container = useContainer(event)
  const registry = container.make(jobRegistryToken) as InMemoryJobRegistry
  registry.register(ObserveQueueContextJob.name, ObserveQueueContextJob)
  await useQueue(event).sync(new ObserveQueueContextJob({ observed }))
  return {
    responseCorrelationId: useExecutionContext(event).snapshot().correlationId,
    emittedCorrelationId: observed.correlationId,
  }
})
