import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

export function getRequestPath(event: H3Event): string {
  const url = getRequestURL(event)
  return `${url.origin}${url.pathname}`
}

export function buildPageUrl(event: H3Event, page: number, perPage: number): string {
  const url = getRequestURL(event)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))
  return url.toString()
}

export function buildCursorUrl(event: H3Event, cursor: string, perPage: number): string {
  const url = getRequestURL(event)
  url.searchParams.delete('page')
  url.searchParams.set('cursor', cursor)
  url.searchParams.set('per_page', String(perPage))
  return url.toString()
}
