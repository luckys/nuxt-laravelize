import type { Resolver } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { Job, jobRegistryToken, type InMemoryJobRegistry } from '@luckys_luis/nuxt-laravelize-queue/runtime'

const observations = new Map<string, string>()

class ObserveQueueContextJob extends Job<{ observationKey: string }> {
  readonly payload: { observationKey: string }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { observationKey: string }
  }

  handle(resolver: Resolver): void {
    observations.set(this.payload.observationKey, resolver.make(executionContextToken).snapshot().correlationId)
  }
}

export default defineEventHandler(async (event) => {
  const observationKey = globalThis.crypto.randomUUID()
  const container = useContainer(event)
  const registry = container.make(jobRegistryToken) as InMemoryJobRegistry
  registry.register(ObserveQueueContextJob.name, ObserveQueueContextJob)
  let emittedCorrelationId: string | undefined
  try {
    await useQueue(event).sync(new ObserveQueueContextJob({ observationKey }))
    emittedCorrelationId = observations.get(observationKey)
  }
  finally {
    observations.delete(observationKey)
  }
  return {
    responseCorrelationId: useExecutionContext(event).snapshot().correlationId,
    emittedCorrelationId,
  }
})
