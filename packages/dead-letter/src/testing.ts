/* eslint-disable @stylistic/max-statements-per-line, @stylistic/lines-between-class-members */
import { DeadLetterAmbiguousError, DeadLetterInvalidStateError, DeadLetterNotFoundError, DeadLetterOperationConflictError, DeadLetterStaleRevisionError, deadLetterOperationFingerprint, sanitizeDeadLetterError, type DeadLetterAdapter, type DeadLetterDetail, type DeadLetterKey, type DeadLetterListRequest, type DeadLetterMutation, type DeadLetterMutationResult, type DeadLetterOperationReceipt, type DeadLetterOperationStore, type DeadLetterRetry } from './index.js'

export class MemoryDeadLetterOperationStore implements DeadLetterOperationStore {
  readonly #items = new Map<string, DeadLetterOperationReceipt>()
  async get(id: string) { return this.#items.get(id) }
  async reserve(id: string, fingerprint: string) { if (this.#items.has(id)) return 'exists' as const; this.#items.set(id, { fingerprint, status: 'pending' }); return 'reserved' as const }
  async finalize(id: string, fingerprint: string, resolution: { status: 'committed', result: DeadLetterMutationResult } | { status: 'failed', failureCode: 'not_found' | 'stale_revision' | 'invalid_state' }) { const prior = this.#items.get(id); if (!prior || prior.fingerprint !== fingerprint) throw new DeadLetterOperationConflictError(); this.#items.set(id, { fingerprint, ...resolution }) }
}
export class MemoryDeadLetterAdapter implements DeadLetterAdapter {
  readonly capabilities = Object.freeze({ retry: true, discard: true, scheduleRetry: true })
  readonly #items = new Map<string, DeadLetterDetail>()
  readonly #operations = new MemoryDeadLetterOperationStore()
  constructor(readonly source: string, items: readonly DeadLetterDetail[] = []) { for (const item of items) this.#items.set(this.id(item.key), structuredClone(item)) }
  async list(request: Omit<DeadLetterListRequest, 'source' | 'cursor'> & { cursor?: string }) {
    const sorted = [...this.#items.values()].filter(item => (!request.namespace || item.key.namespace === request.namespace) && (!request.type || item.type === request.type) && (!request.disposition || item.disposition === request.disposition)).sort((a, b) => a.terminalAt.localeCompare(b.terminalAt) || a.key.id.localeCompare(b.key.id))
    const start = request.cursor ? sorted.findIndex(item => `${item.terminalAt}\0${item.key.id}` === request.cursor) + 1 : 0
    const selected = sorted.slice(start, start + (request.limit ?? 25) + 1); const items = selected.slice(0, request.limit ?? 25)
    return { items: items.map(({ payload: _, tenantHint, error, ...item }) => ({ ...item, ...(request.includeTenantHint && tenantHint ? { tenantHint } : {}), ...(request.includeErrorSummary && sanitizeDeadLetterError(error) ? { error: sanitizeDeadLetterError(error) } : {}) })), ...(selected.length > items.length && items.at(-1) ? { nextCursor: `${items.at(-1)!.terminalAt}\0${items.at(-1)!.key.id}` } : {}) }
  }
  async get(key: DeadLetterKey, options?: { includePayload?: boolean, includeTenantHint?: boolean, includeErrorSummary?: boolean }) { const item = this.#items.get(this.id(key)); if (!item) throw new DeadLetterNotFoundError(); const { payload, tenantHint, error, ...safe } = item; return { ...safe, ...(options?.includePayload ? { payload: structuredClone(payload) } : {}), ...(options?.includeTenantHint && tenantHint ? { tenantHint } : {}), ...(options?.includeErrorSummary && error ? { error } : {}) } }
  retry(request: DeadLetterRetry) { return this.mutate('retry', request) }
  discard(request: DeadLetterMutation) { return this.mutate('discard', request) }
  private async mutate(action: 'retry' | 'discard', request: DeadLetterMutation): Promise<DeadLetterMutationResult> {
    const hash = await deadLetterOperationFingerprint(action, request); const replay = await this.#operations.get(request.operationId)
    if (replay) { if (replay.fingerprint !== hash) throw new DeadLetterOperationConflictError(); if (replay.status === 'committed') return replay.result!; if (replay.status === 'pending') throw new DeadLetterAmbiguousError(); throw replay.failureCode === 'not_found' ? new DeadLetterNotFoundError() : replay.failureCode === 'stale_revision' ? new DeadLetterStaleRevisionError() : new DeadLetterInvalidStateError() }
    await this.#operations.reserve(request.operationId, hash)
    const item = this.#items.get(this.id(request.key)); const failure = !item ? 'not_found' as const : item.revision !== request.revision ? 'stale_revision' as const : item.disposition !== 'active' ? 'invalid_state' as const : undefined
    if (failure) { await this.#operations.finalize(request.operationId, hash, { status: 'failed', failureCode: failure }); if (failure === 'not_found') throw new DeadLetterNotFoundError(); if (failure === 'stale_revision') throw new DeadLetterStaleRevisionError(); throw new DeadLetterInvalidStateError() }
    const current = item!
    const result = { key: request.key, disposition: action === 'discard' ? 'discarded' as const : 'active' as const, revision: String(Number(current.revision) + 1), operationId: request.operationId, committedAt: new Date().toISOString() }
    if (action === 'discard') this.#items.set(this.id(request.key), { ...current, disposition: 'discarded', revision: result.revision })
    else this.#items.delete(this.id(request.key))
    await this.#operations.finalize(request.operationId, hash, { status: 'committed', result }); return result
  }
  private id(key: DeadLetterKey) { return `${key.namespace}\0${key.id}` }
}
