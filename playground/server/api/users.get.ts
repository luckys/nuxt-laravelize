import { defineLaravelizedHandler } from '../../../src/http/defineLaravelizedHandler'
import { userControllerToken } from '../controllers/userTokens'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'list',
})
