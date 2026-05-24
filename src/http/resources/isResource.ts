import { Resource } from './Resource'
import { ResourceCollection } from './ResourceCollection'

export function isResource(value: unknown): value is Resource<unknown> {
  return value instanceof Resource
}

export function isResourceCollection(value: unknown): value is ResourceCollection<Resource<unknown>> {
  return value instanceof ResourceCollection
}
