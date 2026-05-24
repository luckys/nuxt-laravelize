import type { H3Event } from 'h3'

import { Resource } from '../../../src/http/resources/Resource'

interface User {
  id: string
  email: string
  name: string
}

export class UserResource extends Resource<User> {
  override toArray(event: H3Event): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: this.resource.id,
      email: this.resource.email,
      name: this.resource.name,
    }
    const role = event.node.req.headers['x-user-role']
    if (role) base.meta = { role }
    return base
  }
}
