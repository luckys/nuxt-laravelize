import { EventNotRegisteredError, JobNotRegisteredError } from './errors'
import type { Job } from './Job'
import type { EventConstructor, JobConstructor, JobRegistry } from './JobRegistry'

export class InMemoryJobRegistry implements JobRegistry {
  readonly #jobs = new Map<string, JobConstructor>()
  readonly #events = new Map<string, EventConstructor>()

  registerJob(name: string, ctor: JobConstructor): void {
    this.#jobs.set(name, ctor)
  }

  registerEvent(name: string, ctor: EventConstructor): void {
    this.#events.set(name, ctor)
  }

  rehydrateJob(payload: { name: string, args: readonly unknown[] }): Job {
    const ctor = this.#jobs.get(payload.name)
    if (!ctor) throw new JobNotRegisteredError(payload.name)
    return new ctor(...(payload.args as never[]))
  }

  getEvent(name: string): EventConstructor {
    const ctor = this.#events.get(name)
    if (!ctor) throw new EventNotRegisteredError(name)
    return ctor
  }
}
