import { createError } from 'h3'

import type { Dispatcher } from '../../../src/events'
import type { PaginatedResourceCollection, Resource } from '../../../src/http'
import { LengthAwarePaginator } from '../../../src/pagination/LengthAwarePaginator'

import { UserRegistered } from '../events/UserRegistered'
import { UserResource } from '../resources/UserResource'

import type { UsersControllerContract } from './userTokens'

const SEED = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
  { id: 'user-3', email: 'alan@example.com', name: 'Alan Turing' },
  { id: 'user-4', email: 'donald@example.com', name: 'Donald Knuth' },
  { id: 'user-5', email: 'edsger@example.com', name: 'Edsger Dijkstra' },
  { id: 'user-6', email: 'barbara@example.com', name: 'Barbara Liskov' },
  { id: 'user-7', email: 'tony@example.com', name: 'Tony Hoare' },
  { id: 'user-8', email: 'john@example.com', name: 'John von Neumann' },
  { id: 'user-9', email: 'linus@example.com', name: 'Linus Torvalds' },
  { id: 'user-10', email: 'tim@example.com', name: 'Tim Berners-Lee' },
  { id: 'user-11', email: 'guido@example.com', name: 'Guido van Rossum' },
  { id: 'user-12', email: 'bjarne@example.com', name: 'Bjarne Stroustrup' },
] as const

export class UserController implements UsersControllerContract {
  readonly #dispatcher: Dispatcher
  #nextId = 1

  constructor(dispatcher: Dispatcher) {
    this.#dispatcher = dispatcher
  }

  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string } {
    const id = `user-${this.#nextId}`
    this.#nextId += 1
    return { id, email: input.body.email, name: input.body.name }
  }

  async register(_input: { body: { email: string, name: string }, query: undefined, params: undefined }): Promise<{ id: string }> {
    const id = `user-${this.#nextId}`
    this.#nextId += 1
    await this.#dispatcher.dispatch(new UserRegistered(id))
    return { id }
  }

  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, email: string, name: string }> {
    const found = SEED.find(user => user.id === input.params.id)
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    return new UserResource({ ...found })
  }

  list(input: { body: undefined, query: { page: number, per_page: number }, params: undefined }): PaginatedResourceCollection<Resource<{ id: string, email: string, name: string }>> {
    const { page, per_page } = input.query
    const start = (page - 1) * per_page
    const slice = SEED.slice(start, start + per_page).map(user => ({ ...user }))
    const paginator = new LengthAwarePaginator(slice, SEED.length, per_page, page)
    return UserResource.collection(paginator)
  }
}
