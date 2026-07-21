import { canonicalizeEnvelope, createEnvelope, OutboxMessageConflictError, sanitizeErrorSummary, type InboxClaim, type InboxStore, type MessageEnvelope, type OutboxAppendOptions, type OutboxStore, type StoredMessage } from './index.js'

type Mutable = {
  envelope: MessageEnvelope
  state: StoredMessage['state']
  attempts: number
  availableAt: string
  appendAvailableAt?: string
  leaseOwner?: string
  leaseToken?: string
  leaseUntil?: string
  lastError?: string
}
const iso = (value: string) => Date.parse(value)
const canonicalIso = (value: string, name: string): string => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`${name} must be a canonical ISO timestamp`)
  return value
}
export class InMemoryReliabilityStore implements OutboxStore, InboxStore {
  readonly durability = 'volatile' as const
  readonly records = new Map<string, Mutable>()
  constructor(private readonly capacity = 1000) {
    if (capacity < 1)
      throw new TypeError('Capacity must be positive')
  }

  private key(namespace: 'outbox' | 'inbox', id: string) {
    return `${namespace}:${id}`
  }

  async append(envelope: MessageEnvelope, options: OutboxAppendOptions = {}): Promise<void> {
    const normalized = createEnvelope({ id: envelope.id, type: envelope.type, occurredAt: envelope.occurredAt, payload: envelope.payload, context: envelope.context })
    const key = this.key('outbox', envelope.id)
    const availableAt = canonicalIso(options.availableAt ?? normalized.occurredAt, 'availableAt')
    const existing = this.records.get(key)
    if (existing) {
      if (canonicalizeEnvelope(existing.envelope) !== canonicalizeEnvelope(normalized) || existing.appendAvailableAt !== availableAt) throw new OutboxMessageConflictError(envelope.id)
      return
    }
    if (this.records.size >= this.capacity)
      throw new Error('In-memory reliability store capacity exceeded')
    this.records.set(key, { envelope: structuredClone(normalized), state: 'pending', attempts: 0, availableAt, appendAvailableAt: availableAt })
  }

  async claim(options: {
    owner: string
    token: string
    limit: number
    now: string
    leaseUntil: string
    types?: readonly string[]
    excludeIds?: readonly string[]
  }): Promise<StoredMessage[]>
  async claim(message: MessageEnvelope, options: {
    owner: string
    token: string
    now: string
    leaseUntil: string
  }): Promise<InboxClaim>
  async claim(first: MessageEnvelope | {
    owner: string
    token: string
    limit: number
    now: string
    leaseUntil: string
    types?: readonly string[]
    excludeIds?: readonly string[]
  }, second?: {
    owner: string
    token: string
    now: string
    leaseUntil: string
  }): Promise<StoredMessage[] | InboxClaim> {
    if ('version' in first) {
      const o = second!
      const key = this.key('inbox', first.id)
      let row = this.records.get(key)
      if (row?.state === 'delivered' || row?.state === 'dead')
        return { status: 'duplicate' }
      if (
        (row?.state === 'processing' && iso(row.leaseUntil!) > iso(o.now))
        || (row?.state === 'pending' && iso(row.availableAt) > iso(o.now))
      )
        return { status: 'busy' }
      if (!row) {
        if (this.records.size >= this.capacity)
          throw new Error('In-memory reliability store capacity exceeded')
        row = { envelope: structuredClone(first), state: 'pending', attempts: 0, availableAt: o.now }
        this.records.set(key, row)
      }
      const leaseToken = `${o.token}:${first.id}`
      this.take(row, o.owner, leaseToken, o.leaseUntil)
      return { status: 'claimed', attempts: row.attempts, leaseToken }
    }
    const rows = [...this.records.entries()]
      .filter(([key, row]) => {
        const matchesNamespace = key.startsWith('outbox:')
        const matchesType = !first.types?.length || first.types.includes(row.envelope.type)
        const isExcluded = first.excludeIds?.includes(row.envelope.id) ?? false
        const isAvailable = row.state === 'pending' && iso(row.availableAt) <= iso(first.now)
        const leaseExpired = row.state === 'processing' && iso(row.leaseUntil!) <= iso(first.now)
        return matchesNamespace && matchesType && !isExcluded && (isAvailable || leaseExpired)
      })
      .slice(0, first.limit)
      .map(([, row]) => row)
    rows.forEach(r => this.take(r, first.owner, `${first.token}:${r.envelope.id}`, first.leaseUntil))
    return structuredClone(rows)
  }

  private take(row: Mutable, owner: string, token: string, leaseUntil: string) {
    row.state = 'processing'
    row.attempts++
    row.leaseOwner = owner
    row.leaseToken = token
    row.leaseUntil = leaseUntil
  }

  async delivered(namespace: 'outbox' | 'inbox', id: string, token: string, now: string) {
    this.update(namespace, id, token, now, (r) => {
      r.state = 'delivered'
      this.clearLease(r)
    })
  }

  async renew(namespace: 'outbox' | 'inbox', id: string, token: string, now: string, leaseUntil: string) {
    this.update(namespace, id, token, now, (row) => {
      if (iso(leaseUntil) > iso(row.leaseUntil!)) row.leaseUntil = leaseUntil
    })
  }

  async retry(namespace: 'outbox' | 'inbox', id: string, token: string, now: string, availableAt: string, error: string) {
    this.update(namespace, id, token, now, (r) => {
      r.state = 'pending'
      r.availableAt = availableAt
      r.lastError = sanitizeErrorSummary(error)
      this.clearLease(r)
    })
  }

  async dead(namespace: 'outbox' | 'inbox', id: string, token: string, now: string, error: string) {
    this.update(namespace, id, token, now, (r) => {
      r.state = 'dead'
      r.lastError = sanitizeErrorSummary(error)
      this.clearLease(r)
    })
  }

  private clearLease(row: Mutable) {
    delete row.leaseOwner
    delete row.leaseToken
    delete row.leaseUntil
  }

  private update(namespace: 'outbox' | 'inbox', id: string, token: string, now: string, change: (row: Mutable) => void) {
    const row = this.records.get(this.key(namespace, id))
    if (!row || row.state !== 'processing' || row.leaseToken !== token || iso(row.leaseUntil!) <= iso(now))
      throw new Error('Message lease lost')
    change(row)
  }
}
export class OutboxStoreFake extends InMemoryReliabilityStore {
}
export class InboxStoreFake extends InMemoryReliabilityStore {
}
