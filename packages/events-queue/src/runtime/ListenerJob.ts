import type { Resolver, Token } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Listener } from '@luckys_luis/nuxt-laravelize-events/runtime'
import { Job } from '@luckys_luis/nuxt-laravelize-queue/runtime'

import { eventRegistryToken } from './tokens'

export interface ListenerJobPayload extends Record<string, unknown> {
  readonly listenerTokenKey: string
  readonly eventName: string
  readonly eventArgs: readonly unknown[]
}

export class ListenerJob extends Job<ListenerJobPayload> {
  static override readonly tries = 3
  static override readonly queue = 'laravelize.listeners'
  readonly payload: ListenerJobPayload

  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as ListenerJobPayload
  }

  async handle(resolver: Resolver): Promise<void> {
    const listener = resolver.make({ key: this.payload.listenerTokenKey } as Token<Listener<unknown>>)
    const event = resolver.make(eventRegistryToken).make(this.payload.eventName, this.payload.eventArgs)
    await listener.handle(event)
  }
}
