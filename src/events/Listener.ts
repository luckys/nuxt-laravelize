export interface Listener<E> {
  handle(event: E): void | Promise<void>
}

export interface ShouldQueue {
  readonly shouldQueue: true
}
