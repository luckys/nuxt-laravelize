import type { H3Event } from 'h3'

import { isResource, isResourceCollection } from './isResource'
import { isPaginatedResourceCollection } from './PaginatedResourceCollection'
import { Resource } from './Resource'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export async function serialize(value: unknown, event: H3Event): Promise<unknown> {
  if (isResource(value)) {
    const result = await value.toArray(event)
    return serialize(result, event)
  }
  if (isResourceCollection(value)) {
    return value.toArray(event)
  }
  if (isPaginatedResourceCollection(value)) {
    return value.toArray(event)
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => serialize(item, event)))
  }
  if (isPlainObject(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, v]) => [key, await serialize(v, event)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}

export async function serializeResource(value: unknown, event: H3Event): Promise<unknown> {
  const result = await serialize(value, event)
  if (isResource(value) && Resource.shouldWrap) {
    return { data: result }
  }
  return result
}
