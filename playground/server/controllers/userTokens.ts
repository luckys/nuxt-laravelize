import { createToken } from '../../../src/core/container/Token'
import type { PaginatedResourceCollection, Resource } from '../../../src/http'

export interface UsersControllerContract {
  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string }
  register(input: { body: { email: string, name: string }, query: undefined, params: undefined }): Promise<{ id: string }>
  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, email: string, name: string }>
  list(input: { body: undefined, query: { page: number, per_page: number }, params: undefined }): PaginatedResourceCollection<Resource<{ id: string, email: string, name: string }>>
}

export const userControllerToken = createToken<UsersControllerContract>('playground.user-controller')
