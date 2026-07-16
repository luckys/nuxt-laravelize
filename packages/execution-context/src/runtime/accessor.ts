import { createToken, type Resolver } from '@nuxt-laravelize/core/runtime'
import type { ExecutionContext } from './ExecutionContext'

export const executionContextToken = createToken<ExecutionContext>('laravelize.execution-context')
export class MissingExecutionContextError extends Error {
  constructor() {
    super('No execution context is bound to the current scope')
    this.name = 'MissingExecutionContextError'
  }
}
export class ExecutionContextAccessor {
  constructor(private readonly resolver: Resolver) {}
  optional(): ExecutionContext | undefined { return this.resolver.has(executionContextToken) ? this.resolver.make(executionContextToken) : undefined }
  current(): ExecutionContext {
    const value = this.optional()
    if (!value) throw new MissingExecutionContextError()
    return value
  }
}
