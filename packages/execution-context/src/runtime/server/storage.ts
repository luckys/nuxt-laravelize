import { AsyncLocalStorage } from 'node:async_hooks'
import type { ExecutionContext } from '../ExecutionContext'

const storage = new AsyncLocalStorage<ExecutionContext>()
export const runWithExecutionContext = <T>(context: ExecutionContext, operation: () => T): T => storage.run(context, operation)
export const currentExecutionContextOptional = (): ExecutionContext | undefined => storage.getStore()
