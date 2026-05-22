import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { PostsController } from '../controllers/PostsController'
import { postsControllerToken } from '../controllers/postsTokens'

export default class PostsControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(postsControllerToken, () => new PostsController())
  }
}
