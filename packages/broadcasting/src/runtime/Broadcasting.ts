export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export abstract class Channel {
  constructor(readonly name: string) {
    if (!name.trim() || name.length > 200) throw new TypeError('Channel name must contain 1-200 characters.')
  }
}
export class PublicChannel extends Channel { readonly kind = 'public' }
export class PrivateChannel extends Channel {
  readonly kind = 'private'
  constructor(name: string) { super(canonicalName(name, 'private-')) }
}
export class PresenceChannel extends Channel {
  readonly kind = 'presence'
  constructor(name: string) { super(canonicalName(name, 'presence-')) }
}

export interface ShouldBroadcast {
  broadcastOn(): Channel | Channel[]
  broadcastAs?(): string
  broadcastWith(): unknown
  broadcastWhen?(): boolean | Promise<boolean>
  socket?: string
}

export interface BroadcastMessage {
  channels: readonly Channel[]
  event: string
  payload: { [key: string]: JsonValue }
  exceptSocket?: string
}

export interface Broadcaster { broadcast(message: BroadcastMessage): Promise<void> }

export class BroadcastingNotConfiguredError extends Error {
  constructor() {
    super('Broadcasting is not configured. Register a Broadcaster or explicitly enable the bounded memory driver.')
    this.name = 'BroadcastingNotConfiguredError'
  }
}

export class FailClosedBroadcaster implements Broadcaster {
  async broadcast(): Promise<void> { throw new BroadcastingNotConfiguredError() }
}

export class BroadcastingManager {
  constructor(private readonly driver: Broadcaster) {}
  broadcast(message: BroadcastMessage): Promise<void> { return this.driver.broadcast(validateMessage(message)) }
}

export function validateMessage(message: BroadcastMessage): BroadcastMessage {
  if (!message.channels.length) throw new TypeError('At least one broadcast channel is required.')
  if (message.channels.length > 100) throw new TypeError('A broadcast may target at most 100 channels.')
  if (!message.event.trim() || message.event.length > 200) throw new TypeError('Broadcast event name must contain 1-200 characters.')
  if (message.exceptSocket !== undefined && (!message.exceptSocket.trim() || message.exceptSocket.length > 200)) throw new TypeError('Invalid socket exclusion metadata.')
  return { ...message, payload: assertJsonObject(message.payload) }
}

export function assertJsonObject(value: unknown): { [key: string]: JsonValue } {
  const maximumDepth = 32
  const maximumBytes = 10_000
  const seen = new Set<object>()
  const visit = (current: unknown, path: string, depth: number): JsonValue => {
    if (depth > maximumDepth) throw new TypeError(`Broadcast payload exceeds maximum depth ${maximumDepth} at ${path}.`)
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current
    if (typeof current === 'number' && Number.isFinite(current)) return current
    if (typeof current !== 'object') throw new TypeError(`Broadcast payload is not JSON-safe at ${path}.`)
    if (seen.has(current)) throw new TypeError(`Broadcast payload contains a cycle at ${path}.`)
    seen.add(current)
    try {
      if (Array.isArray(current)) return current.map((item, index) => visit(item, `${path}[${index}]`, depth + 1))
      if (Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) throw new TypeError(`Broadcast payload must use plain objects at ${path}.`)
      return Object.fromEntries(Object.entries(current).map(([key, item]) => [key, visit(item, `${path}.${key}`, depth + 1)]))
    }
    finally { seen.delete(current) }
  }
  const result = visit(value, '$', 0)
  if (result === null || Array.isArray(result) || typeof result !== 'object') throw new TypeError('Broadcast payload must be a JSON object.')
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maximumBytes) throw new TypeError(`Broadcast payload exceeds ${maximumBytes} bytes.`)
  return result
}

function canonicalName(name: string, prefix: 'private-' | 'presence-'): string {
  const withoutKnownPrefix = name.replace(/^(?:private-|presence-)/, '')
  return `${prefix}${withoutKnownPrefix}`
}
