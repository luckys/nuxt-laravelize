import type { UsersControllerContract } from './userTokens'

export class UserController implements UsersControllerContract {
  #nextId = 1

  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string } {
    const id = `user-${this.#nextId}`
    this.#nextId += 1
    return { id, email: input.body.email, name: input.body.name }
  }
}
