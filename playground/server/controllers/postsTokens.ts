import { createToken } from '../../../src/core/container/Token'

export interface PostsControllerContract {
  create(input: { body: { title: string, content: string }, query: undefined, params: undefined }): { id: string, title: string }
}

export const postsControllerToken = createToken<PostsControllerContract>('playground.posts-controller')
