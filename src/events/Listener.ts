export interface Listener<E> {
  handle(event: E): void | false | Promise<void | false>
}

export interface ShouldQueue {
  readonly shouldQueue: true
}
