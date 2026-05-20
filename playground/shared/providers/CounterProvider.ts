import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'
import type { Token } from '../../../src/core/container/Token'

// Inline token creation to avoid a runtime src/ import in Nitro's server bundle.
export const counterToken: Token<{ next: () => number }> = { key: 'playground.counter' }

export default class CounterProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(counterToken, () => {
      let current = 0
      return {
        next: () => {
          current += 1
          return current
        },
      }
    })
  }
}
