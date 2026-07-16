import { ExecutionContext, type ExecutionContextInput, type IdFactory } from '../runtime/ExecutionContext'

export class ExecutionContextBuilder {
  #input: ExecutionContextInput = { source: { type: 'test' }, executionId: 'test-execution', correlationId: 'test-correlation', startedAt: '2020-01-01T00:00:00.000Z' }
  with(input: Partial<ExecutionContextInput>): this {
    this.#input = { ...this.#input, ...input }
    return this
  }

  build(idFactory?: IdFactory): ExecutionContext { return ExecutionContext.create(this.#input, idFactory) }
}
export const fakeExecutionContext = (input: Partial<ExecutionContextInput> = {}) => new ExecutionContextBuilder().with(input).build()
