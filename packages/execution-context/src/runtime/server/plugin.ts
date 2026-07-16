import { getHeader, setHeader } from 'h3'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { ExecutionContext } from '../ExecutionContext'
import { executionContextToken } from '../accessor'

const validCorrelation = /^\w[\w.:-]{0,127}$/
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const options = useRuntimeConfig().laravelizeExecutionContext as { correlationHeader: string, trustIncomingCorrelationHeader: boolean }
    const header = options.correlationHeader || 'x-correlation-id'
    const incoming = options.trustIncomingCorrelationHeader ? getHeader(event, header) : undefined
    const context = ExecutionContext.create({ source: { type: 'http', name: event.method }, ...(incoming && validCorrelation.test(incoming) ? { correlationId: incoming } : {}) })
    if (!event.context.laravelizeContainer) throw new Error('Laravelize request scope is unavailable')
    event.context.laravelizeContainer.override(executionContextToken, context)
    setHeader(event, header, context.snapshot().correlationId)
  })
})

declare module 'h3' {
  interface H3EventContext { laravelizeContainer?: import('@nuxt-laravelize/core/runtime').Container }
}
