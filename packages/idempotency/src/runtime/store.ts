export type IdempotencyState = 'processing' | 'completed' | 'failed'

export interface StoredResponse {
  readonly kind: 'json' | 'response'
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

export interface IdempotencyRecord {
  readonly key: string
  readonly fingerprint: string
  readonly state: IdempotencyState
  readonly leaseToken: string
  readonly leaseExpiresAt: number
  readonly expiresAt: number
  readonly response?: StoredResponse
}

export type AcquireResult
  = | { readonly outcome: 'acquired', readonly record: IdempotencyRecord }
    | { readonly outcome: 'replay' | 'processing' | 'failed' | 'conflict', readonly record: IdempotencyRecord }

/** Atomic persistence boundary. Implementations must fence every mutation by leaseToken. */
export interface IdempotencyStore {
  acquire(input: { key: string, fingerprint: string, leaseToken: string, now: number, leaseMs: number, retentionMs: number, retryFailed?: boolean }): Promise<AcquireResult>
  renew(key: string, leaseToken: string, now: number, leaseMs: number): Promise<boolean>
  complete(key: string, leaseToken: string, response: StoredResponse, now: number, retentionMs: number): Promise<boolean>
  fail(key: string, leaseToken: string, now: number, retentionMs: number): Promise<boolean>
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>()

  async acquire(input: { key: string, fingerprint: string, leaseToken: string, now: number, leaseMs: number, retentionMs: number, retryFailed?: boolean }): Promise<AcquireResult> {
    const existing = this.records.get(input.key)
    if (!existing || existing.expiresAt <= input.now) {
      const record = this.processing(input)
      this.records.set(input.key, record)
      return { outcome: 'acquired', record }
    }
    if (existing.fingerprint !== input.fingerprint) return { outcome: 'conflict', record: existing }
    if (existing.state === 'completed') return { outcome: 'replay', record: existing }
    if (existing.state === 'failed') {
      if (input.retryFailed) {
        const record = this.processing(input)
        this.records.set(input.key, record)
        return { outcome: 'acquired', record }
      }
      return { outcome: 'failed', record: existing }
    }
    if (existing.leaseExpiresAt <= input.now) {
      const record = this.processing(input)
      this.records.set(input.key, record)
      return { outcome: 'acquired', record }
    }
    return { outcome: 'processing', record: existing }
  }

  async renew(key: string, leaseToken: string, now: number, leaseMs: number): Promise<boolean> {
    const record = this.records.get(key)
    if (!record || record.state !== 'processing' || record.leaseToken !== leaseToken || record.leaseExpiresAt <= now) return false
    this.records.set(key, { ...record, leaseExpiresAt: now + leaseMs, expiresAt: now + leaseMs })
    return true
  }

  async complete(key: string, leaseToken: string, response: StoredResponse, now: number, retentionMs: number): Promise<boolean> {
    return this.finish(key, leaseToken, now, { state: 'completed', response, expiresAt: now + retentionMs })
  }

  async fail(key: string, leaseToken: string, now: number, retentionMs: number): Promise<boolean> {
    return this.finish(key, leaseToken, now, { state: 'failed', expiresAt: now + retentionMs })
  }

  private processing(input: { key: string, fingerprint: string, leaseToken: string, now: number, leaseMs: number, retentionMs: number }): IdempotencyRecord {
    return { key: input.key, fingerprint: input.fingerprint, state: 'processing', leaseToken: input.leaseToken, leaseExpiresAt: input.now + input.leaseMs, expiresAt: input.now + input.leaseMs }
  }

  private finish(key: string, token: string, now: number, patch: Pick<IdempotencyRecord, 'state' | 'expiresAt'> & { response?: StoredResponse }): boolean {
    const record = this.records.get(key)
    if (!record || record.state !== 'processing' || record.leaseToken !== token || record.leaseExpiresAt <= now) return false
    this.records.set(key, { ...record, ...patch, leaseExpiresAt: now })
    return true
  }
}
