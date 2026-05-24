import type { H3Event } from 'h3'

import { isResource, isResourceCollection } from './isResource'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export async function serializeResource(value: unknown, event: H3Event): Promise<unknown> {
  if (isResource(value)) {
    const result = await value.toArray(event)
    return serializeResource(result, event)
  }
  if (isResourceCollection(value)) {
    return value.toArray(event)
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => serializeResource(item, event)))
  }
  if (isPlainObject(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, v]) => [key, await serializeResource(v, event)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}
