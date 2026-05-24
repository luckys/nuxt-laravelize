import { defineLaravelizedHandler } from '../../../../src/http/defineLaravelizedHandler'
import { userControllerToken } from '../../controllers/userTokens'
import { FindUserRequest } from '../../requests/FindUserRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'find',
  request: FindUserRequest,
})
