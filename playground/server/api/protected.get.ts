import { blockingMiddlewareToken } from '../http/middlewareTokens'
import { protectedControllerToken } from '../controllers/protectedTokens'

export default defineLaravelizedHandler({
  controller: protectedControllerToken,
  method: 'index',
  middleware: [blockingMiddlewareToken],
})
