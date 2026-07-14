import type { H3Event } from 'h3'

import type { Paginator } from '../../pagination/Paginator'
import { isPaginator } from '../../pagination/isPaginator'
import { PaginatedResourceCollection } from './PaginatedResourceCollection'

import { ResourceCollection } from './ResourceCollection'

export abstract class Resource<T> {
  readonly resource: T

  static #wrappingEnabled = true

  static withoutWrapping(): void {
    Resource.#wrappingEnabled = false
  }

  /** Restore wrapping after withoutWrapping() (test/restore use). */
  static restoreWrapping(): void {
    Resource.#wrappingEnabled = true
  }

  static get shouldWrap(): boolean {
    return Resource.#wrappingEnabled
  }

  constructor(resource: T) {
    this.resource = resource
  }

  abstract toArray(event: H3Event): Record<string, unknown> | Promise<Record<string, unknown>>

  protected when<V>(condition: boolean, value: V): V | undefined
  protected when<V>(condition: boolean, value: V, defaultValue: V): V
  protected when<V>(condition: boolean, value: V, defaultValue?: V): V | undefined {
    return condition ? value : defaultValue
  }

  protected mergeWhen(condition: boolean, fields: Record<string, unknown>): Record<string, unknown> {
    return condition ? fields : {}
  }

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
