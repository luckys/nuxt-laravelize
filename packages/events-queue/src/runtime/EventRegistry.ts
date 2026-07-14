export type SerializableEventConstructor = new (...args: never[]) => object

export class EventNotRegisteredError extends Error {
  constructor(name: string) { super(`Queued event "${name}" is not registered.`) }
}

export class EventRegistry {
  readonly #constructors = new Map<string, SerializableEventConstructor>()
  register(name: string, constructor: SerializableEventConstructor): void { this.#constructors.set(name, constructor) }
  make(name: string, args: readonly unknown[]): object {
    const Constructor = this.#constructors.get(name)
    if (!Constructor) throw new EventNotRegisteredError(name)
    return new Constructor(...(args as never[]))
  }
}
