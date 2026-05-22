import { defineLaravelizedHandler } from '../../../src/http/defineLaravelizedHandler'

import { postsControllerToken } from '../controllers/postsTokens'
import { CreatePostRequest } from '../requests/CreatePostRequest'

export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'create',
  request: CreatePostRequest,
})
