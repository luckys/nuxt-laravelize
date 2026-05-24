import type { H3Event } from 'h3'

import { Resource } from '../../../src/http/resources/Resource'

import { UserResource } from './UserResource'

interface Post {
  id: string
  title: string
  content: string
  authorId: string
}

const AUTHOR_INDEX: Record<string, { id: string, email: string, name: string } | undefined> = {
  'user-1': { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  'user-2': { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
}

export class PostResource extends Resource<Post> {
  override toArray(_event: H3Event): Record<string, unknown> {
    const author = AUTHOR_INDEX[this.resource.authorId]
    return {
      id: this.resource.id,
      title: this.resource.title,
      content: this.resource.content,
      author: author ? new UserResource(author) : null,
    }
  }
}
