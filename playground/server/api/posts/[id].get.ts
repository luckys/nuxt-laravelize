import { defineLaravelizedHandler } from '../../../../src/http/defineLaravelizedHandler'
import { postsControllerToken } from '../../controllers/postsTokens'
import { FindPostRequest } from '../../requests/FindPostRequest'

export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'find',
  request: FindPostRequest,
})
