/* eslint-disable @stylistic/max-statements-per-line, no-empty */
import { getHeader, getResponseStatus } from 'h3'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import type { ActiveSpan, Observability } from '../contracts'
import { noopObservability } from '../NoopObservability'
import { observabilityToken } from '../tokens'
import { sanitizeCarrier } from '../validation'
import { bindObservability } from '../BoundObservability'
import { recordHttpCompletion } from './recordHttpCompletion'
import { lifecycle } from './lifecycle'

const privateSpans = new WeakMap<object, { span: ActiveSpan, observability: Observability, ended: boolean, method: string, route: string }>()
export default defineNitroPlugin((nitroApp) => {
  let root: Observability = noopObservability
  nitroApp.hooks.hook('request', (event) => {
    const scope = event.context.laravelizeContainer
    if (!scope) return
    root = scope.has(observabilityToken) ? scope.make(observabilityToken) : noopObservability
    const config = useRuntimeConfig().laravelizeObservability as { trustIncomingTraceContext?: boolean } | undefined
    const method = safeMethod(event.method)
    const route = routeTemplate(event.context.matchedRoute)
    const parent = config?.trustIncomingTraceContext ? sanitizeCarrier({ traceparent: getHeader(event, 'traceparent'), tracestate: getHeader(event, 'tracestate') }) : undefined
    try {
      const span = root.startSpan(`http.${method.toLowerCase()}`, { kind: 'server', attributes: { 'http.request.method': method, 'http.route': route }, ...(parent && parent.traceparent ? { parent } : { root: true }) })
      privateSpans.set(event, { span, observability: root, ended: false, method, route })
      scope.override(observabilityToken, bindObservability(root, span))
      if (span.traceId && span.spanId && scope.has(executionContextToken)) try { scope.override(executionContextToken, scope.make(executionContextToken).withTrace(span.traceId, span.spanId)) }
      catch {}
    }
    catch {
      const state = privateSpans.get(event)
      if (state) {
        try { state.span.end() }
        catch {}; privateSpans.delete(event)
      }
    }
  })
  const finish = (event: object, statusOverride?: number) => {
    const state = privateSpans.get(event)
    if (!state || state.ended) return
    state.ended = true
    let status = statusOverride ?? 500
    if (statusOverride === undefined) try { status = getResponseStatus(event as never) }
    catch {}
    recordHttpCompletion(state, status)
    try { state.span.end() }
    catch {}
    privateSpans.delete(event)
  }
  nitroApp.hooks.hook('afterResponse', event => finish(event))
  nitroApp.hooks.hook('error', (error, context) => {
    const status = typeof error === 'object' && error && 'statusCode' in error && Number.isInteger(error.statusCode) ? Number(error.statusCode) : 500
    if (context.event) finish(context.event, status >= 400 && status <= 599 ? status : 500)
  })
  nitroApp.hooks.hook('close', async () => lifecycle(root, 2_000))
})
function safeMethod(method: string): string { return /^[A-Z]{1,16}$/.test(method) ? method : 'OTHER' }
function routeTemplate(route: unknown): string {
  const path = route && typeof route === 'object' && 'path' in route ? (route as { path?: unknown }).path : undefined
  return typeof path === 'string' && path.length <= 128 && /^\/[\w:\-/*.[\]]*$/.test(path) ? path : 'unknown'
}
