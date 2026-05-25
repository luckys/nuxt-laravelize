import type { Job } from './Job'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JobConstructor = new (...args: any[]) => Job
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventConstructor = new (...args: any[]) => object

export interface JobRegistry {
  registerJob(name: string, ctor: JobConstructor): void
  registerEvent(name: string, ctor: EventConstructor): void
  rehydrateJob(payload: { name: string, args: readonly unknown[] }): Job
  getEvent(name: string): EventConstructor
}
