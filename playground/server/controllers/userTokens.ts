import { createToken } from '../../../src/core/container/Token'

export interface UsersControllerContract {
  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string }
}

export const userControllerToken = createToken<UsersControllerContract>('playground.user-controller')
