import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'
import type { Token } from '../../../src/core/container/Token'

// Inline token creation to avoid a runtime src/ import in Nitro's server bundle.
export const requestIdToken: Token<string> = { key: 'playground.requestId' }

export default class RequestIdProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(requestIdToken, () => Math.random().toString(36).slice(2))
  }
}
