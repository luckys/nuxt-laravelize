/* eslint-disable @stylistic/max-statements-per-line */
export interface DeadLetterOperationsRuntimeOptions {
  enabled: boolean
  pagePath: string
  apiPath: string
  allowedOrigins: readonly string[]
  pageSize: number
  errorSummaries: boolean
}

export const defaultOptions: DeadLetterOperationsRuntimeOptions = Object.freeze({ enabled: false, pagePath: '/operations/dead-letters', apiPath: '/api/operations/dead-letters', allowedOrigins: [], pageSize: 25, errorSummaries: false })

function canonicalPath(value: string, name: string): string {
  if (!/^\/[\w.~-]+(?:\/[\w.~-]+)*$/.test(value) || value.split('/').some(segment => segment === '.' || segment === '..')) throw new TypeError(`${name} must be a canonical absolute path`)
  return value
}

export function canonicalOrigin(value: string): string {
  let url: URL
  try { url = new URL(value) }
  catch { throw new TypeError('allowedOrigins must contain canonical origins') }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value !== url.origin) throw new TypeError('allowedOrigins must contain exact canonical HTTPS origins (HTTP is loopback-only)')
  return value
}

export function resolveOptions(input: Partial<DeadLetterOperationsRuntimeOptions> = {}): DeadLetterOperationsRuntimeOptions {
  const options = { ...defaultOptions, ...input }
  options.pagePath = canonicalPath(options.pagePath, 'pagePath')
  options.apiPath = canonicalPath(options.apiPath, 'apiPath')
  if (options.pagePath === options.apiPath || options.pagePath.startsWith(`${options.apiPath}/`) || options.apiPath.startsWith(`${options.pagePath}/`)) throw new TypeError('pagePath and apiPath must not overlap')
  if (!Number.isSafeInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 100) throw new TypeError('pageSize must be between 1 and 100')
  options.allowedOrigins = [...new Set(options.allowedOrigins.map(canonicalOrigin))]
  if (options.enabled && options.allowedOrigins.length === 0) throw new TypeError('allowedOrigins is required when dead-letter operations are enabled')
  return Object.freeze(options)
}
