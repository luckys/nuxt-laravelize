import { CursorPaginator } from './CursorPaginator'
import { LengthAwarePaginator } from './LengthAwarePaginator'
import type { Paginator } from './Paginator'
import { SimplePaginator } from './SimplePaginator'

export function isPaginator(value: unknown): value is Paginator<unknown> {
  return value instanceof LengthAwarePaginator
    || value instanceof SimplePaginator
    || value instanceof CursorPaginator
}
