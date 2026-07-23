/* eslint-disable @stylistic/max-statements-per-line */
import type { H3Event } from 'h3'
import { getHeader, getMethod, getRequestWebStream } from 'h3'
import { operationsHttpError } from './httpError'

const JSON_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i

export interface MutationGuardOptions { readonly allowedOrigins: readonly string[], readonly maximumBodyBytes?: number }

export async function readGuardedJson(event: H3Event, options: MutationGuardOptions): Promise<unknown> {
  if (getMethod(event) !== 'POST' || !JSON_TYPE.test(getHeader(event, 'content-type') ?? '')) throw operationsHttpError(415, 'invalid_request')
  if (getHeader(event, 'x-laravelize-operations') !== '1') throw operationsHttpError(403, 'forbidden')
  const origin = getHeader(event, 'origin')
  if (!origin || !options.allowedOrigins.includes(origin)) throw operationsHttpError(403, 'forbidden')
  const fetchSite = getHeader(event, 'sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') throw operationsHttpError(403, 'forbidden')
  const maximum = options.maximumBodyBytes ?? 4096
  const length = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(length) && length > maximum) throw operationsHttpError(413, 'invalid_request')
  const stream = getRequestWebStream(event)
  if (!stream) throw operationsHttpError(400, 'invalid_request')
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) { await reader.cancel(); throw operationsHttpError(413, 'invalid_request') }
      chunks.push(value)
    }
  }
  finally { reader.releaseLock() }
  if (!size) throw operationsHttpError(400, 'invalid_request')
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
  catch { throw operationsHttpError(400, 'invalid_request') }
}
