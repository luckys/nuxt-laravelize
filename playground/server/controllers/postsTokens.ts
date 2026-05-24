import { createToken } from '../../../src/core/container/Token'
import type { Resource } from '../../../src/http'

export interface PostsControllerContract {
  create(input: { body: { title: string, content: string }, query: undefined, params: undefined }): { id: string, title: string }
  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, title: string, content: string, authorId: string }>
}

export const postsControllerToken = createToken<PostsControllerContract>('playground.posts-controller')
