import type { H3Event } from 'h3'

import type { Resource } from '../http/resources/Resource'
import { serializeResource } from '../http/resources/serializeResource'

import type { Paginator } from './Paginator'

export class PaginatedResourceCollection<R extends Resource<unknown>> {
  readonly paginator: Paginator<unknown>
  readonly resourceCtor: new (item: unknown) => R

  constructor(paginator: Paginator<unknown>, resourceCtor: new (item: unknown) => R) {
    this.paginator = paginator
    this.resourceCtor = resourceCtor
  }

  async toArray(event: H3Event): Promise<{
    data: Array<unknown>
    links: Record<string, string | null>
    meta: Record<string, unknown>
  }> {
    const data = await Promise.all(
      this.paginator.items.map(item =>
        serializeResource(new this.resourceCtor(item), event),
      ),
    )
    return {
      data,
      links: this.paginator.toLinks(event),
      meta: this.paginator.toMeta(event),
    }
  }
}
