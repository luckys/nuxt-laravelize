import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { InMemoryGate } from '../../../src/auth/Gate'
import { gateToken } from '../../../src/auth/GateToken'

interface AuthorContext {
  role: string
}

export default class GateProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(gateToken, () => {
      const gate = new InMemoryGate()
      gate.define('create-post', (user) => {
        const author = user as AuthorContext | undefined
        return author?.role === 'author'
      })
      return gate
    })
  }
}
