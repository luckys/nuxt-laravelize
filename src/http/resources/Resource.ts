import type { H3Event } from 'h3'

import { ResourceCollection } from './ResourceCollection'

export abstract class Resource<T> {
  readonly resource: T

  constructor(resource: T) {
    this.resource = resource
  }

  abstract toArray(event: H3Event): Record<string, unknown> | Promise<Record<string, unknown>>

  static collection<R extends Resource<unknown>, U>(
    this: new (item: U) => R,
    items: readonly U[],
  ): ResourceCollection<R> {
    return new ResourceCollection(items.map(item => new this(item)))
  }
}
