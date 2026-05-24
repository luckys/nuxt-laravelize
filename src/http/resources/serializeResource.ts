import type { H3Event } from 'h3'

import { Resource } from './Resource'

export async function serializeResource(value: unknown, event: H3Event): Promise<unknown> {
  if (value instanceof Resource) {
    return value.toArray(event)
  }
  return value
}
