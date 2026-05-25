export abstract class Job {
  static readonly tries: number = 1
  static readonly delay: number = 0
  static readonly queue: string = 'default'
  static readonly backoff: number = 0

  abstract handle(...args: unknown[]): void | Promise<void>

  abstract serialize(): { name: string, args: readonly unknown[] }
}
