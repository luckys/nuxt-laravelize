import type { H3Event } from 'h3'

export interface Middleware {
  handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> | unknown
}
