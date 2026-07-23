/* eslint-disable @stylistic/max-statements-per-line */
import { authorizationToken } from '@nuxt-laravelize/authorization/runtime'
import type { DeadLetterAdapterRegistry, DeadLetterDisposition, DeadLetterKey, DeadLetterManager } from '@nuxt-laravelize/dead-letter'
import type { H3Event } from 'h3'
import { getQuery, getRouterParam, setResponseHeaders } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { DeadLetterOperationsRuntimeOptions } from '../options'
import { deadLetterAdapterRegistryToken, deadLetterManagerToken } from '../tokens'
import { deadLetterHttpProblem } from './errors'
import { readGuardedJson } from './guards'
import { isOperationsHttpError, operationsHttpError } from './httpError'

type Endpoint = 'bootstrap' | 'list' | 'detail' | 'payload' | 'retry' | 'discard'
const VALUE = /^[\w.:-]{1,128}$/
const SOURCE = /^[a-z][a-z0-9-]{0,62}$/

function fail(statusCode: number, code: string): never {
  throw operationsHttpError(statusCode, code)
}
function text(value: unknown, maximum: number, pattern = VALUE): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !pattern.test(value)) fail(400, 'invalid_request')
  return value
}
function optionalText(value: unknown, maximum: number): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > maximum) fail(400, 'invalid_request')
  return value
}
function reason(value: unknown): string | undefined {
  const result = optionalText(value, 512)?.normalize('NFC')
  if (result && [...result].some((character) => {
    const point = character.codePointAt(0) ?? 0
    return point < 32 || point === 127 || (point >= 0x202A && point <= 0x202E) || (point >= 0x2066 && point <= 0x2069)
  })) fail(400, 'invalid_request')
  return result
}
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, 'invalid_request')
  return value as Record<string, unknown>
}
function key(event: H3Event): DeadLetterKey {
  return { source: text(getRouterParam(event, 'source'), 63, SOURCE), namespace: text(getRouterParam(event, 'namespace'), 64), id: text(getRouterParam(event, 'deadLetterId'), 128) }
}
function options(event: H3Event): DeadLetterOperationsRuntimeOptions {
  const value = (useRuntimeConfig(event) as { laravelizeDeadLetterOperations?: DeadLetterOperationsRuntimeOptions }).laravelizeDeadLetterOperations
  if (!value?.enabled) fail(404, 'not_found')
  return value
}
function manager(event: H3Event): DeadLetterManager {
  if (!event.context.laravelizeContainer) fail(503, 'unavailable')
  return event.context.laravelizeContainer.make(deadLetterManagerToken)
}
function registry(event: H3Event): DeadLetterAdapterRegistry {
  if (!event.context.laravelizeContainer) fail(503, 'unavailable')
  const value = event.context.laravelizeContainer.make(deadLetterAdapterRegistryToken)
  if (!value.sources().length) fail(503, 'no_adapters')
  return value
}
function ensureSource(event: H3Event, source: string): void { if (!registry(event).sources().includes(source)) fail(404, 'not_found') }
async function authorize(event: H3Event, ability: string, args: readonly unknown[] = []): Promise<void> {
  try {
    if (!event.context.laravelizeContainer) fail(403, 'forbidden')
    await event.context.laravelizeContainer.make(authorizationToken).authorize(ability, { args: Object.freeze([...args]) })
  }
  catch { fail(403, 'forbidden') }
}
async function allows(event: H3Event, ability: string, args: readonly unknown[] = []): Promise<boolean> {
  try { return await event.context.laravelizeContainer!.make(authorizationToken).allows(ability, { args: Object.freeze([...args]) }) }
  catch { return false }
}
const sourceContext = (source: string) => Object.freeze({ source })
const keyContext = (itemKey: DeadLetterKey) => Object.freeze({ key: Object.freeze({ ...itemKey }) })
async function capabilities(event: H3Event, source: string, errorSummaries: boolean, itemKey?: DeadLetterKey) {
  const args = [itemKey ? keyContext(itemKey) : sourceContext(source)]
  const adapter = registry(event).capabilities(source)
  const retry = adapter.retry && await allows(event, 'dead-letters.retry', args)
  return Object.freeze({ viewPayload: await allows(event, 'dead-letters.view-payload', args), viewErrorSummary: errorSummaries && await allows(event, 'dead-letters.view-error-summary', args), retry, discard: adapter.discard && await allows(event, 'dead-letters.discard', args), scheduleRetry: retry && adapter.scheduleRetry, retryInbox: await allows(event, 'dead-letters.retry-inbox', args) })
}
function headers(event: H3Event): void { setResponseHeaders(event, { 'cache-control': 'no-store, private', 'pragma': 'no-cache', 'x-content-type-options': 'nosniff' }) }

export function mapDeadLetterError(error: unknown): never {
  const problem = deadLetterHttpProblem(error)
  fail(problem.statusCode, problem.code)
}

export async function handleDeadLetterOperation(event: H3Event, endpoint: Endpoint): Promise<unknown> {
  headers(event)
  const config = options(event)
  try {
    if (endpoint === 'bootstrap') {
      const adapters = registry(event)
      const sources: string[] = []
      for (const source of adapters.sources()) if (await allows(event, 'dead-letters.list', [sourceContext(source)])) sources.push(source)
      if (!sources.length) fail(403, 'forbidden')
      const sourceCapabilities = Object.fromEntries(await Promise.all(sources.map(async source => [source, await capabilities(event, source, config.errorSummaries)] as const)))
      return { sources, pageSize: config.pageSize, errorSummaries: config.errorSummaries, sourceCapabilities, capabilities: sourceCapabilities[sources[0]!] }
    }
    if (endpoint === 'list') {
      const query = getQuery(event)
      if (Object.keys(query).some(name => !['source', 'namespace', 'type', 'disposition', 'cursor'].includes(name))) fail(400, 'invalid_request')
      const disposition = optionalText(query.disposition, 16) as DeadLetterDisposition | undefined
      if (disposition && disposition !== 'active' && disposition !== 'discarded') fail(400, 'invalid_request')
      const source = text(query.source, 63, SOURCE)
      await authorize(event, 'dead-letters.list', [sourceContext(source)]); ensureSource(event, source)
      const includeErrorSummary = config.errorSummaries && await allows(event, 'dead-letters.view-error-summary', [sourceContext(source)])
      return await manager(event).list({ source, namespace: optionalText(query.namespace, 64), type: optionalText(query.type, 128), disposition, cursor: optionalText(query.cursor, 1024), limit: config.pageSize, includeErrorSummary, includeTenantHint: false })
    }
    const itemKey = key(event)
    const context = keyContext(itemKey)
    if (endpoint === 'detail' || endpoint === 'payload') {
      await authorize(event, 'dead-letters.view', [context])
      if (endpoint === 'payload') await authorize(event, 'dead-letters.view-payload', [context])
      ensureSource(event, itemKey.source)
      const includeErrorSummary = config.errorSummaries && await allows(event, 'dead-letters.view-error-summary', [context])
      return { ...await manager(event).get(itemKey, { includePayload: endpoint === 'payload', includeErrorSummary, includeTenantHint: false }), capabilities: await capabilities(event, itemKey.source, config.errorSummaries, itemKey) }
    }
    await authorize(event, endpoint === 'retry' ? 'dead-letters.retry' : 'dead-letters.discard', [context])
    if (endpoint === 'retry' && itemKey.source === 'reliability' && itemKey.namespace === 'inbox') await authorize(event, 'dead-letters.retry-inbox', [context])
    ensureSource(event, itemKey.source)
    const adapterCapabilities = registry(event).capabilities(itemKey.source)
    if (endpoint === 'retry' ? !adapterCapabilities.retry : !adapterCapabilities.discard) fail(400, 'invalid_state')
    const body = exactObject(await readGuardedJson(event, { allowedOrigins: config.allowedOrigins }), endpoint === 'retry' ? ['revision', 'operationId', 'reason', 'availableAt'] : ['revision', 'operationId', 'reason'])
    const mutationReason = reason(body.reason)
    const mutation = { key: itemKey, revision: text(body.revision, 512, /^.{1,512}$/), operationId: text(body.operationId, 128), ...(mutationReason ? { reason: mutationReason } : {}) }
    if (endpoint === 'retry') return await manager(event).retry({ ...mutation, availableAt: text(body.availableAt, 32, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) })
    return await manager(event).discard(mutation)
  }
  catch (error) {
    if (isOperationsHttpError(error)) throw error
    mapDeadLetterError(error)
  }
}
