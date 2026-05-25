import type { H3Event } from 'h3'

export interface Paginator<T> {
  readonly items: readonly T[]
  toMeta(event: H3Event): Record<string, unknown>
  toLinks(event: H3Event): Record<string, string | null>
}

export interface ParsePageParamsOptions {
  defaultPerPage?: number
  maxPerPage?: number
}

export interface PageParams {
  page: number
  perPage: number
}

export interface CursorParams {
  cursor: string | null
  perPage: number
}
