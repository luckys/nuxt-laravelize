import type { ProtectedControllerContract } from './protectedTokens'

export class ProtectedController implements ProtectedControllerContract {
  index(_input: { body: undefined, query: undefined, params: undefined }): { message: string } {
    return { message: 'protected resource' }
  }
}
