import { createToken } from '../../../src/core/container/Token'

export interface ProtectedControllerContract {
  index(input: { body: undefined, query: undefined, params: undefined }): { message: string }
}

export const protectedControllerToken = createToken<ProtectedControllerContract>('playground.protected-controller')
