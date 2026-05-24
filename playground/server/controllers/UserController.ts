import type { Resource, ResourceCollection } from '../../../src/http'

import { UserResource } from '../resources/UserResource'

import type { UsersControllerContract } from './userTokens'

const SEED = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
] as const

export class UserController implements UsersControllerContract {
  #nextId = 1

  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string } {
    const id = `user-${this.#nextId}`
    this.#nextId += 1
    return { id, email: input.body.email, name: input.body.name }
  }

  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, email: string, name: string }> {
    const found = SEED.find(user => user.id === input.params.id)
    if (!found) throw new Error(`User ${input.params.id} not found`)
    return new UserResource({ ...found })
  }

  list(_input: { body: undefined, query: undefined, params: undefined }): ResourceCollection<Resource<{ id: string, email: string, name: string }>> {
    return UserResource.collection(SEED.map(user => ({ ...user })))
  }
}
