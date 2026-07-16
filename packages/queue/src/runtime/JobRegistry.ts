import type { Job, SerializedJob } from './Job'

export type JobConstructor = new (payload: Record<string, unknown>) => Job

export class JobNotRegisteredError extends Error {
  constructor(name: string) { super(`Queue job "${name}" is not registered.`) }
}

export class InMemoryJobRegistry {
  readonly #constructors = new Map<string, JobConstructor>()

  register(name: string, constructor: JobConstructor): void {
    this.#constructors.set(name, constructor)
  }

  rehydrate(serialized: SerializedJob): Job {
    if (serialized.version !== 1 && serialized.version !== 2) throw new Error('Unsupported queue payload version')
    const Constructor = this.#constructors.get(serialized.name)
    if (!Constructor) throw new JobNotRegisteredError(serialized.name)
    return new Constructor(serialized.payload)
  }
}
