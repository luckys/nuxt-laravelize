import type { H3Event } from 'h3'

import type { Paginator, ParsePageParamsOptions } from './Paginator'
import { parseCursorParams } from './extractParams'
import { buildCursorUrl, getRequestPath } from './urls'

interface CursorPayload {
  key: string
  direction: 'next' | 'prev'
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodeCursor(cursor: string): CursorPayload {
  const json = Buffer.from(cursor, 'base64url').toString('utf-8')
  return JSON.parse(json) as CursorPayload
}

export class CursorPaginator<T> implements Paginator<T> {
  readonly items: readonly T[]
  readonly perPage: number
  readonly nextCursor: string | null
  readonly prevCursor: string | null

  constructor(
    items: readonly T[],
    perPage: number,
    nextCursor: string | null,
    prevCursor: string | null,
  ) {
    this.items = items
    this.perPage = Math.max(perPage, 1)
    this.nextCursor = nextCursor
    this.prevCursor = prevCursor
  }

  static fromRequest<T>(
    event: H3Event,
    items: readonly T[],
    nextCursorKey: string | null,
    prevCursorKey: string | null,
    options?: ParsePageParamsOptions,
  ): CursorPaginator<T> {
    const { perPage } = parseCursorParams(event, options)
    return new CursorPaginator(
      items,
      perPage,
      nextCursorKey ? encodeCursor({ key: nextCursorKey, direction: 'next' }) : null,
      prevCursorKey ? encodeCursor({ key: prevCursorKey, direction: 'prev' }) : null,
    )
  }

  toMeta(event: H3Event): Record<string, unknown> {
    return {
      path: getRequestPath(event),
      per_page: this.perPage,
      next_cursor: this.nextCursor,
      prev_cursor: this.prevCursor,
    }
  }

  toLinks(event: H3Event): Record<string, string | null> {
    return {
      prev: this.prevCursor ? buildCursorUrl(event, this.prevCursor, this.perPage) : null,
      next: this.nextCursor ? buildCursorUrl(event, this.nextCursor, this.perPage) : null,
    }
  }
}
