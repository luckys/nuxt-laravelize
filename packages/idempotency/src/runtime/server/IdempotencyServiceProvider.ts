import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { InMemoryIdempotencyStore } from '../store'
import { idempotencyStoreToken } from '../tokens'

export default class IdempotencyServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (container.has(idempotencyStoreToken)) return
    const driver = useRuntimeConfig().laravelizeIdempotency?.driver
    if (driver === 'memory') container.singleton(idempotencyStoreToken, () => new InMemoryIdempotencyStore())
    // Deliberately leave the token unbound: resolution fails closed unless an app binds a durable store.
  }
}
