import { describe, expect, it, vi } from 'vitest'
import { DrizzlePostgresSearchEngine, type DrizzleScoutDatabase } from '../src'

describe('DrizzlePostgresSearchEngine', () => {
  it('rejects filters outside the explicit allowlist before querying', async () => {
    const execute = vi.fn()
    const engine = new DrizzlePostgresSearchEngine({ execute } as unknown as DrizzleScoutDatabase)
    await expect(engine.search({ index: 'articles', query: '', filters: [{ field: 'tenant_id', values: ['other'] }], orders: [], page: 1, perPage: 10 })).rejects.toThrow('not allowed')
    expect(execute).not.toHaveBeenCalled()
  })
  it('wraps multi-document updates in one explicit transaction', async () => {
    const execute = vi.fn().mockResolvedValue([])
    const transaction = vi.fn(async callback => await callback({ execute, transaction }))
    const engine = new DrizzlePostgresSearchEngine({ execute, transaction } as DrizzleScoutDatabase)
    const document = (key: string) => ({ searchableKey: () => key, searchableType: () => 'article', toSearchableDocument: () => ({ title: `Title ${key}` }) })
    await engine.update('articles', [document('1'), document('2')])
    expect(transaction).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
