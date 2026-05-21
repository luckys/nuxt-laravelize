import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { ProtectedController } from '../controllers/ProtectedController'
import { protectedControllerToken } from '../controllers/protectedTokens'

export default class ProtectedControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(protectedControllerToken, () => new ProtectedController())
  }
}
