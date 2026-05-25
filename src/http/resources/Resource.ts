import type { H3Event } from 'h3'

import type { Paginator } from '../../pagination/Paginator'
import { isPaginator } from '../../pagination/isPaginator'
import { PaginatedResourceCollection } from '../../pagination/PaginatedResourceCollection'

import { ResourceCollection } from './ResourceCollection'

export abstract class Resource<T> {
  readonly resource: T

  constructor(resource: T) {
    this.resource = resource
  }

  abstract toArray(event: H3Event): Record<string, unknown> | Promise<Record<string, unknown>>

  static collection<R extends Resource<U>, U>(
    this: new (item: U) => R,
    items: readonly U[],
  ): ResourceCollection<R>
  static collection<R extends Resource<U>, U>(
    this: new (item: U) => R,
    items: Paginator<U>,
  ): PaginatedResourceCollection<R>
  static collection<R extends Resource<U>, U>(
    this: new (item: U) => R,
    items: readonly U[] | Paginator<U>,
  ): ResourceCollection<R> | PaginatedResourceCollection<R> {
    if (isPaginator(items)) {
      return new PaginatedResourceCollection(items, this as unknown as new (item: unknown) => R)
    }
    return new ResourceCollection(items.map(item => new this(item)))
  }
}
