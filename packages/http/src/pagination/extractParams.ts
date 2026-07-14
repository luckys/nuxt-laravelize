import type { H3Event } from 'h3'
import { getQuery } from 'h3'

import type { CursorParams, PageParams, ParsePageParamsOptions } from './Paginator'

const DEFAULT_PER_PAGE = 15
const DEFAULT_MAX_PER_PAGE = 100

function toFinitePositive(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(n, 1)
}

export function parsePageParams(event: H3Event, options?: ParsePageParamsOptions): PageParams {
  const query = getQuery(event)
  const page = toFinitePositive(query.page, 1)
  const requested = toFinitePositive(query.per_page, options?.defaultPerPage ?? DEFAULT_PER_PAGE)
  const cap = options?.maxPerPage ?? DEFAULT_MAX_PER_PAGE
  const perPage = Math.min(requested, cap)
  return { page, perPage }
}

export function parseCursorParams(event: H3Event, options?: ParsePageParamsOptions): CursorParams {
  const query = getQuery(event)
  const raw = query.cursor
  const cursor = typeof raw === 'string' && raw.length > 0 ? raw : null
  const requested = toFinitePositive(query.per_page, options?.defaultPerPage ?? DEFAULT_PER_PAGE)
  const cap = options?.maxPerPage ?? DEFAULT_MAX_PER_PAGE
  const perPage = Math.min(requested, cap)
  return { cursor, perPage }
}
