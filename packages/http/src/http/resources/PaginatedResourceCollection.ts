import type { H3Event } from 'h3'
import type { Paginator } from '../../pagination/Paginator'
import type { Resource } from './Resource'
import { serialize } from './serializeResource'

export class PaginatedResourceCollection<R extends Resource<unknown>> {
  constructor(
    readonly paginator: Paginator<unknown>,
    readonly resourceCtor: new (item: unknown) => R,
  ) {}

  async toArray(event: H3Event): Promise<{ data: unknown[], links: Record<string, string | null>, meta: Record<string, unknown> }> {
    return {
      data: await Promise.all(this.paginator.items.map(item => serialize(new this.resourceCtor(item), event))),
      links: this.paginator.toLinks(event),
      meta: this.paginator.toMeta(event),
    }
  }
}

export function isPaginatedResourceCollection(value: unknown): value is PaginatedResourceCollection<Resource<unknown>> {
  return value instanceof PaginatedResourceCollection
}
