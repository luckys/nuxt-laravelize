import type { PostsControllerContract } from './postsTokens'

export class PostsController implements PostsControllerContract {
  #nextId = 1

  create(input: { body: { title: string, content: string }, query: undefined, params: undefined }): { id: string, title: string } {
    const id = `post-${this.#nextId}`
    this.#nextId += 1
    return { id, title: input.body.title }
  }
}
