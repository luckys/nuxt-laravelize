import type { Resolver, Token } from '@luckys_luis/nuxt-laravelize-core/runtime'

export type EventConstructor<E = unknown> = new (...args: never[]) => E

export interface Listener<E> {
  handle(event: E): void | false | Promise<void | false>
}

export interface ShouldQueue {
  readonly shouldQueue: true
}

export interface QueuedListenerAdapter {
  enqueue(listener: Token<Listener<unknown>>, event: unknown): boolean | Promise<boolean>
}

export interface EventListenerRegistrar {
  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void
  listenAny(listener: Token<Listener<unknown>>): void
}

export interface EventSubscriber {
  subscribe(dispatcher: EventListenerRegistrar): void
}

export interface Dispatcher extends EventListenerRegistrar {
  subscribe(subscriber: Token<EventSubscriber>): void
  dispatch<E>(event: E): Promise<void>
}

export type EventResolver = Resolver
