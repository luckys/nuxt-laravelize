import { Cron } from 'croner'

export type MaintenanceBehavior = 'skip' | 'run'

export interface OperationDescriptor {
  readonly type: 'operation'
  readonly operation: string
}

export interface QueueDispatchDescriptor {
  readonly type: 'queue'
  readonly job: string
  readonly queue?: string
  readonly payload?: Readonly<Record<string, unknown>>
}

export type ScheduleDescriptor = OperationDescriptor | QueueDispatchDescriptor

export interface ScheduledTask {
  readonly name: string
  readonly cron: string
  readonly description?: string
  readonly timezone?: string
  readonly descriptor?: ScheduleDescriptor
  readonly overlap?: { readonly expiresAfterSeconds: number }
  readonly oneServer?: boolean
  readonly maintenance?: MaintenanceBehavior
  readonly hooks?: { readonly success?: string, readonly failure?: string }
}

export interface NormalizedScheduledTask extends Omit<ScheduledTask, 'descriptor' | 'oneServer' | 'maintenance'> {
  readonly descriptor: ScheduleDescriptor
  readonly oneServer: boolean
  readonly maintenance: MaintenanceBehavior
}

export class InvalidCronExpressionError extends Error {
  constructor(expression: string) { super(`Invalid five-field cron expression: "${expression}".`) }
}

export class InvalidTimezoneError extends Error {
  constructor(timezone: string) { super(`Invalid IANA timezone: "${timezone}".`) }
}

export class DuplicateScheduledTaskError extends Error {
  constructor(name: string) { super(`Scheduled task name "${name}" is already defined.`) }
}

type MutableMetadata = {
  description?: string
  timezone?: string
  overlap?: { expiresAfterSeconds: number }
  oneServer: boolean
  maintenance: MaintenanceBehavior
  hooks?: { success?: string, failure?: string }
}

export class Schedule {
  readonly #tasks: NormalizedScheduledTask[] = []
  readonly #owners = new Map<string, symbol>()

  task(name: string, operation = name): PendingSchedule {
    return this.operation(name, operation)
  }

  operation(name: string, operation = name): PendingSchedule {
    ensureName(name, 'Scheduled task name')
    ensureName(operation, 'Scheduled operation identifier')
    return new PendingSchedule(name.trim(), normalizeDescriptor({ type: 'operation', operation }, name), (owner, task) => this.#store(owner, task))
  }

  dispatch(name: string, descriptor: Omit<QueueDispatchDescriptor, 'type'> | string, payload?: Readonly<Record<string, unknown>>): PendingSchedule {
    ensureName(name, 'Scheduled task name')
    const value = typeof descriptor === 'string' ? { job: descriptor, payload } : descriptor
    ensureName(value.job, 'Queued job identifier')
    if (value.queue != null) ensureName(value.queue, 'Queue name')
    return new PendingSchedule(name.trim(), normalizeDescriptor({ type: 'queue', ...value }, name), (owner, task) => this.#store(owner, task))
  }

  all(): readonly NormalizedScheduledTask[] { return Object.freeze(this.#tasks.slice()) }

  #store(owner: symbol, task: NormalizedScheduledTask): void {
    const existingOwner = this.#owners.get(task.name)
    if (existingOwner && existingOwner !== owner) throw new DuplicateScheduledTaskError(task.name)
    const index = this.#tasks.findIndex(candidate => candidate.name === task.name)
    this.#owners.set(task.name, owner)
    if (index === -1) this.#tasks.push(task)
    else this.#tasks[index] = task
  }
}

export class PendingSchedule {
  readonly #owner = Symbol('scheduled-task')
  readonly #metadata: MutableMetadata = { oneServer: false, maintenance: 'skip' }
  #expression?: string

  constructor(
    private readonly name: string,
    private readonly descriptor: ScheduleDescriptor,
    private readonly store: (owner: symbol, task: NormalizedScheduledTask) => void,
  ) {}

  cron(expression: string): this {
    if (!isFiveFieldCron(expression)) throw new InvalidCronExpressionError(expression)
    this.#expression = expression.trim()
    return this.#commit()
  }

  everyMinute(): this { return this.cron('* * * * *') }
  everyFiveMinutes(): this { return this.cron('*/5 * * * *') }
  everyTenMinutes(): this { return this.cron('*/10 * * * *') }
  everyFifteenMinutes(): this { return this.cron('*/15 * * * *') }
  everyThirtyMinutes(): this { return this.cron('*/30 * * * *') }
  hourly(): this { return this.cron('0 * * * *') }
  daily(): this { return this.cron('0 0 * * *') }
  weekly(): this { return this.cron('0 0 * * 0') }
  monthly(): this { return this.cron('0 0 1 * *') }

  hourlyAt(minute: number): this {
    ensureIntegerInRange(minute, 0, 59, 'hourly minute')
    return this.cron(`${minute} * * * *`)
  }

  dailyAt(time: string): this {
    const { hour, minute } = parseTime(time)
    return this.cron(`${minute} ${hour} * * *`)
  }

  weeklyOn(day: number, time = '00:00'): this {
    ensureIntegerInRange(day, 0, 6, 'weekday')
    const { hour, minute } = parseTime(time)
    return this.cron(`${minute} ${hour} * * ${day}`)
  }

  monthlyOn(day: number, time = '00:00'): this {
    ensureIntegerInRange(day, 1, 31, 'day of month')
    const { hour, minute } = parseTime(time)
    return this.cron(`${minute} ${hour} ${day} * *`)
  }

  timezone(timezone: string): this {
    const normalized = timezone.trim()
    if (!isIanaTimezone(normalized)) throw new InvalidTimezoneError(timezone)
    this.#metadata.timezone = normalized
    return this.#commitIfScheduled()
  }

  description(description: string): this {
    ensureName(description, 'Scheduled task description')
    this.#metadata.description = description.trim()
    return this.#commitIfScheduled()
  }

  withoutOverlapping(expiresAfterMinutes = 24 * 60): this {
    if (!Number.isFinite(expiresAfterMinutes) || expiresAfterMinutes <= 0) throw new Error('Overlap expiry must be a positive number of minutes.')
    this.#metadata.overlap = { expiresAfterSeconds: Math.ceil(expiresAfterMinutes * 60) }
    return this.#commitIfScheduled()
  }

  onOneServer(): this {
    this.#metadata.oneServer = true
    return this.#commitIfScheduled()
  }

  evenInMaintenanceMode(): this {
    this.#metadata.maintenance = 'run'
    return this.#commitIfScheduled()
  }

  skipDuringMaintenance(): this {
    this.#metadata.maintenance = 'skip'
    return this.#commitIfScheduled()
  }

  onSuccess(identifier: string): this {
    ensureName(identifier, 'Success hook identifier')
    this.#metadata.hooks = { ...this.#metadata.hooks, success: identifier.trim() }
    return this.#commitIfScheduled()
  }

  onFailure(identifier: string): this {
    ensureName(identifier, 'Failure hook identifier')
    this.#metadata.hooks = { ...this.#metadata.hooks, failure: identifier.trim() }
    return this.#commitIfScheduled()
  }

  #commitIfScheduled(): this { return this.#expression ? this.#commit() : this }

  #commit(): this {
    if (!this.#expression) return this
    this.store(this.#owner, deepFreeze({ name: this.name, cron: this.#expression, descriptor: this.descriptor, ...cloneValue(this.#metadata) }))
    return this
  }
}

export function defineSchedule(definition: (schedule: Schedule) => void): Schedule {
  const schedule = new Schedule()
  definition(schedule)
  return schedule
}

export function normalizeScheduledTask(task: ScheduledTask): NormalizedScheduledTask {
  if (!task || typeof task !== 'object') throw new Error('Scheduled task must be an object.')
  const name = normalizeIdentifier(task.name, 'Scheduled task name')
  if (typeof task.cron !== 'string' || !isFiveFieldCron(task.cron)) throw new InvalidCronExpressionError(String(task.cron))
  const timezone = normalizeTimezone(task.timezone)
  const description = normalizeOptionalIdentifier(task.description, 'Scheduled task description')
  const descriptor = normalizeDescriptor(task.descriptor, name)
  const overlap = normalizeOverlap(task.overlap)
  if (task.oneServer !== undefined && typeof task.oneServer !== 'boolean') throw new Error('Scheduled task oneServer must be a boolean.')
  if (task.maintenance !== undefined && task.maintenance !== 'skip' && task.maintenance !== 'run') throw new Error('Scheduled task maintenance must be "skip" or "run".')
  const hooks = normalizeHooks(task.hooks)
  return deepFreeze({
    name,
    cron: task.cron.trim(),
    ...(description ? { description } : {}),
    ...(timezone ? { timezone } : {}),
    descriptor,
    ...(overlap ? { overlap } : {}),
    oneServer: task.oneServer ?? false,
    maintenance: task.maintenance ?? 'skip',
    ...(hooks ? { hooks } : {}),
  })
}

export type ScheduledTimestamp = Date | number

export function isScheduledTaskDue(task: ScheduledTask, timestamp: ScheduledTimestamp): boolean {
  const normalized = normalizeScheduledTask(task)
  const instant = timestamp instanceof Date ? timestamp.getTime() : timestamp
  if (!Number.isFinite(instant)) throw new Error('Scheduled timestamp must be a valid Date or epoch millisecond value.')
  const minuteStart = Math.floor(instant / 60_000) * 60_000
  const next = new Cron(normalized.cron, { paused: true, timezone: normalized.timezone ?? 'UTC' }).nextRun(new Date(minuteStart - 1))
  return next != null && next.getTime() >= minuteStart && next.getTime() < minuteStart + 60_000
}

function ensureName(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} cannot be empty.`)
}

function normalizeIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`)
  return value.trim()
}

function normalizeOptionalIdentifier(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : normalizeIdentifier(value, label)
}

function normalizeTimezone(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !isIanaTimezone(value.trim())) throw new InvalidTimezoneError(String(value))
  return value.trim()
}

function normalizeDescriptor(value: unknown, defaultOperation: string): ScheduleDescriptor {
  if (value === undefined) return deepFreeze({ type: 'operation', operation: defaultOperation })
  if (!isPlainRecord(value)) throw new Error('Scheduled task descriptor must be an object.')
  if (value.type === 'operation') return deepFreeze({ type: 'operation', operation: normalizeIdentifier(value.operation, 'Scheduled operation identifier') })
  if (value.type === 'queue') {
    const job = normalizeIdentifier(value.job, 'Queued job identifier')
    const queue = normalizeOptionalIdentifier(value.queue, 'Queue name')
    const payload = value.payload === undefined ? undefined : normalizePayload(value.payload)
    return deepFreeze({ type: 'queue', job, ...(queue ? { queue } : {}), ...(payload ? { payload } : {}) })
  }
  throw new Error('Scheduled task descriptor type must be "operation" or "queue".')
}

function normalizeOverlap(value: unknown): { readonly expiresAfterSeconds: number } | undefined {
  if (value === undefined) return undefined
  if (!isPlainRecord(value)) throw new Error('Scheduled task overlap must be an object.')
  const expiry = value.expiresAfterSeconds
  if (typeof expiry !== 'number' || !Number.isInteger(expiry) || expiry <= 0 || expiry > 2_147_483_647) throw new Error('Scheduled task overlap expiry must be an integer between 1 and 2147483647 seconds.')
  return { expiresAfterSeconds: expiry }
}

function normalizeHooks(value: unknown): { readonly success?: string, readonly failure?: string } | undefined {
  if (value === undefined) return undefined
  if (!isPlainRecord(value)) throw new Error('Scheduled task hooks must be an object.')
  const success = normalizeOptionalIdentifier(value.success, 'Success hook identifier')
  const failure = normalizeOptionalIdentifier(value.failure, 'Failure hook identifier')
  return success || failure ? { ...(success ? { success } : {}), ...(failure ? { failure } : {}) } : undefined
}

function normalizePayload(value: unknown): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) throw new Error('Queue dispatch payload must be a plain object.')
  validateJsonValue(value, 'Queue dispatch payload', new WeakSet())
  return deepFreeze(cloneValue(value))
}

function validateJsonValue(value: unknown, label: string, ancestors: WeakSet<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} numbers must be finite.`)
    return
  }
  if (typeof value !== 'object' || (!Array.isArray(value) && !isPlainRecord(value))) throw new Error(`${label} must contain only JSON-compatible values.`)
  if (ancestors.has(value)) throw new Error(`${label} cannot contain circular references.`)
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new Error(`${label} cannot contain sparse array entries.`)
    }
  }
  if (!Array.isArray(value) && Reflect.ownKeys(value).some(key => typeof key !== 'string')) throw new Error(`${label} cannot contain symbol keys.`)
  for (const item of Object.values(value)) validateJsonValue(item, label, ancestors)
  ancestors.delete(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ensureIntegerInRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${label}: "${value}".`)
}

function parseTime(time: string): { hour: number, minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) throw new Error(`Invalid daily time: "${time}".`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error(`Invalid daily time: "${time}".`)
  return { hour, minute }
}

function isIanaTimezone(timezone: string): boolean {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  }
  catch { return false }
}

function cloneValue<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Array.isArray(value)) return value.map(cloneValue) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)])) as T
  return value
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function isFiveFieldCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  try {
    new Cron(expression, { paused: true })
    return true
  }
  catch { return false }
}
