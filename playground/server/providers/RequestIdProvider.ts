import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'
import type { Token } from '../../../src/core/container/Token'

export const requestIdToken: Token<string> = { key: 'playground.requestId' }

export default class RequestIdProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(requestIdToken, () => Math.random().toString(36).slice(2))
  }
}
