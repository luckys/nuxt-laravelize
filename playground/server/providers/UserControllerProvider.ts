import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { UserController } from '../controllers/UserController'
import { userControllerToken } from '../controllers/userTokens'

export default class UserControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(userControllerToken, () => new UserController())
  }
}
