import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { DeadLetterAdapterRegistry, DeadLetterManager } from '@luckys_luis/nuxt-laravelize-dead-letter'
import { deadLetterAdapterRegistryToken, deadLetterManagerToken } from '../tokens'

export default class DeadLetterOperationsServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(deadLetterAdapterRegistryToken)) container.singleton(deadLetterAdapterRegistryToken, () => new DeadLetterAdapterRegistry())
    if (!container.has(deadLetterManagerToken)) container.singleton(deadLetterManagerToken, resolver => new DeadLetterManager(resolver.make(deadLetterAdapterRegistryToken)))
  }
}
