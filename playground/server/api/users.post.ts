import { userControllerToken } from '../controllers/userTokens'
import { CreateUserRequest } from '../requests/CreateUserRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'store',
  request: CreateUserRequest,
})
