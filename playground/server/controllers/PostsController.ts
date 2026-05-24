import { createError } from 'h3'

import type { Resource } from '../../../src/http'

import { PostResource } from '../resources/PostResource'

import type { PostsControllerContract } from './postsTokens'

const SEED_POSTS = [
  { id: 'post-seed-1', title: 'Hello', content: 'World', authorId: 'user-1' },
] as const

export class PostsController implements PostsControllerContract {
  #nextId = 1

  create(input: { body: { title: string, content: string }, query: undefined, params: undefined }): { id: string, title: string } {
    const id = `post-${this.#nextId}`
    this.#nextId += 1
    return { id, title: input.body.title }
  }

  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, title: string, content: string, authorId: string }> {
    const found = SEED_POSTS.find(post => post.id === input.params.id)
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    return new PostResource({ ...found })
  }
}
