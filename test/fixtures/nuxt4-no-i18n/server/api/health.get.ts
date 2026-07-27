export default defineEventHandler(event => ({ healthy: true, executionLocale: useExecutionContext(event).snapshot().locale ?? null }))
