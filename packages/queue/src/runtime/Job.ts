import type { Resolver } from '@nuxt-laravelize/core/runtime'

export interface SerializedJob {
  readonly version: 1
  readonly name: string
  readonly payload: Record<string, unknown>
}

export abstract class Job<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  static readonly tries: number = 1
  static readonly delay: number = 0
  static readonly queue: string = 'default'
  static readonly backoff: number | readonly number[] = 0

  abstract readonly payload: TPayload
  abstract handle(resolver: Resolver): void | Promise<void>
  failed?(error: unknown): void | Promise<void>

  serialize(): SerializedJob {
    return { version: 1, name: this.constructor.name, payload: this.payload }
  }
}
