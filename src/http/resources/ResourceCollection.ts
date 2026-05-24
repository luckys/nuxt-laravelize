import type { H3Event } from 'h3'

import type { Resource } from './Resource'
import { serializeResource } from './serializeResource'

export class ResourceCollection<R extends Resource<unknown>> {
  readonly items: readonly R[]

  constructor(items: readonly R[]) {
    this.items = items
  }

  async toArray(event: H3Event): Promise<Array<unknown>> {
    return Promise.all(this.items.map(item => serializeResource(item, event)))
  }
}
