import type { Job, SerializedJob } from './Job'

export type JobConstructor = (new (payload: Record<string, unknown>) => Job) & { readonly jobName?: string }

export class JobNotRegisteredError extends Error {
  constructor(name: string) { super(`Queue job "${name}" is not registered.`) }
}
export class JobRegistrationCollisionError extends Error {
  constructor(name: string) { super(`Queue job name "${name}" is already registered to another constructor.`) }
}

export class InMemoryJobRegistry {
  readonly #constructors = new Map<string, JobConstructor>()
  readonly #canonicalNames = new Map<JobConstructor, string>()

  register(name: string, constructor: JobConstructor): void {
    const names = new Set([name, constructor.name, constructor.jobName].filter((value): value is string => Boolean(value)))
    for (const alias of names) {
      const existing = this.#constructors.get(alias)
      if (existing && existing !== constructor) throw new JobRegistrationCollisionError(alias)
    }
    for (const alias of names) this.#constructors.set(alias, constructor)
    if (!this.#canonicalNames.has(constructor)) this.#canonicalNames.set(constructor, constructor.jobName ?? name)
  }

  canonicalName(name: string): string | undefined {
    const constructor = this.#constructors.get(name)
    return constructor ? this.#canonicalNames.get(constructor) : undefined
  }

  rehydrate(serialized: SerializedJob): Job {
    if (!serialized || typeof serialized !== 'object' || (serialized.version !== 1 && serialized.version !== 2)
      || typeof serialized.name !== 'string' || !serialized.name || !serialized.payload || typeof serialized.payload !== 'object' || Array.isArray(serialized.payload))
      throw new Error('Invalid serialized queue payload')
    const Constructor = this.#constructors.get(serialized.name)
    if (!Constructor) throw new JobNotRegisteredError(serialized.name)
    return new Constructor(serialized.payload)
  }
}
