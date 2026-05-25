import { defineLaravelizedHandler } from '../../../src/http/defineLaravelizedHandler'
import { userControllerToken } from '../controllers/userTokens'
import { ListUsersRequest } from '../requests/ListUsersRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'list',
  request: ListUsersRequest,
})
