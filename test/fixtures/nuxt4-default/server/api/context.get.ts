import { currentExecutionContextOptional } from '@nuxt-laravelize/execution-context/runtime/server'

export default defineEventHandler(async (event) => {
  const delay = Number(getQuery(event).delay ?? 0)
  if (delay) await new Promise(resolve => setTimeout(resolve, delay))
  if (getQuery(event).fail === 'true') throw createError({ statusCode: 500, message: 'expected failure' })
  return {
    executionId: useExecutionContext(event).snapshot().executionId,
    ambientExecutionId: currentExecutionContextOptional()?.snapshot().executionId ?? null,
  }
})
