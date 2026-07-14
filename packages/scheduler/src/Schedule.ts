export interface ScheduledTask {
  readonly name: string
  readonly cron: string
}

export class InvalidCronExpressionError extends Error {
  constructor(expression: string) { super(`Invalid five-field cron expression: "${expression}".`) }
}

export class Schedule {
  readonly #tasks: ScheduledTask[] = []

  task(name: string): PendingSchedule {
    if (!name.trim()) throw new Error('Scheduled task name cannot be empty.')
    return new PendingSchedule(name, task => this.#tasks.push(task))
  }

  all(): readonly ScheduledTask[] { return this.#tasks.slice() }
}

export class PendingSchedule {
  constructor(
    private readonly name: string,
    private readonly add: (task: ScheduledTask) => void,
  ) {}

  cron(expression: string): void {
    if (!isFiveFieldCron(expression)) throw new InvalidCronExpressionError(expression)
    this.add({ name: this.name, cron: expression.trim() })
  }

  hourly(): void { this.cron('0 * * * *') }
  daily(): void { this.cron('0 0 * * *') }

  dailyAt(time: string): void {
    const match = /^(\d{2}):(\d{2})$/.exec(time)
    if (!match) throw new Error(`Invalid daily time: "${time}".`)
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour > 23 || minute > 59) throw new Error(`Invalid daily time: "${time}".`)
    this.cron(`${minute} ${hour} * * *`)
  }
}

export function defineSchedule(definition: (schedule: Schedule) => void): Schedule {
  const schedule = new Schedule()
  definition(schedule)
  return schedule
}

function isFiveFieldCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  return fields.length === 5 && fields.every(field => /^[\d*/?,-]+$/.test(field))
}
