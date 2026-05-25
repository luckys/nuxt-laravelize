import type { Resolver } from '../core/container/Container'
import type { Token } from '../core/container/Token'
import type { Listener } from '../events/Listener'

import { Job } from './Job'
import type { JobRegistry } from './JobRegistry'

export interface ListenerJobPayload {
  listenerTokenKey: string
  eventConstructorName: string
  eventArgs: readonly unknown[]
}

export class ListenerJob extends Job {
  static override readonly tries = 3
  static override readonly queue = 'laravelize.listeners'

  readonly payload: ListenerJobPayload

  constructor(payload: ListenerJobPayload) {
    super()
    this.payload = payload
  }

  serialize(): { name: string, args: readonly unknown[] } {
    return { name: 'laravelize.ListenerJob', args: [this.payload] }
  }

  async handle(resolver: Resolver, registry: JobRegistry): Promise<void> {
    const token = { key: this.payload.listenerTokenKey } as Token<Listener<unknown>>
    const listener = resolver.make(token)
    const EventCtor = registry.getEvent(this.payload.eventConstructorName)
    const event = new EventCtor(...(this.payload.eventArgs as never[]))
    await listener.handle(event)
  }
}
