/* eslint-disable @stylistic/max-statements-per-line, no-empty */
import type { ActiveSpan, Observability } from '../contracts'

export function recordHttpCompletion(state: { span: ActiveSpan, observability: Observability, method: string, route: string }, status: number): void {
  try { state.span.setAttributes({ 'http.response.status_code': status }) }
  catch {}
  try { state.span.setStatus(status >= 500 ? 'error' : 'ok') }
  catch {}
  let counter
  try { counter = state.observability.counter('http.server.requests') }
  catch {}
  try { counter?.add(1, { 'http.request.method': state.method, 'http.route': state.route, 'http.response.status_class': `${Math.floor(status / 100)}xx` }) }
  catch {}
}
