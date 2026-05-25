import type { Resource } from '../http/resources/Resource'

import { CursorPaginator } from './CursorPaginator'
import { LengthAwarePaginator } from './LengthAwarePaginator'
import type { Paginator } from './Paginator'
import { PaginatedResourceCollection } from './PaginatedResourceCollection'
import { SimplePaginator } from './SimplePaginator'

export function isPaginator(value: unknown): value is Paginator<unknown> {
  return value instanceof LengthAwarePaginator
    || value instanceof SimplePaginator
    || value instanceof CursorPaginator
}

export function isPaginatedResourceCollection(value: unknown): value is PaginatedResourceCollection<Resource<unknown>> {
  return value instanceof PaginatedResourceCollection
}
