import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, vi } from 'vitest'
import { DrizzleSQLiteSearchEngine, type DrizzleSQLiteDatabase } from '../src/sqlite'
import { TursoLibSQLSearchEngine, type LibSQLScoutClient } from '../src/turso'

const request = { index: 'articles', query: 'care', filters: [{ field: 'status', values: ['published'] }], orders: [{ field: 'published_at', direction: 'desc' as const }], page: 1, perPage: 20 }
const document = (key: string) => ({ searchableKey: () => key, searchableType: () => 'article', toSearchableDocument: () => ({ title: `Title ${key}` }) })

describe('DrizzleSQLiteSearchEngine', () => {
  it('issues parameterized FTS5 SQL and allowlisted JSON filters and sorting', async () => {
    const all = vi.fn().mockReturnValue([])
    const engine = new DrizzleSQLiteSearchEngine({ all, run: vi.fn(), transaction: vi.fn() } as DrizzleSQLiteDatabase, { filterableFields: ['status'], sortableFields: ['published_at'] })
    await engine.search(request)
    const compiled = new SQLiteSyncDialect().sqlToQuery(all.mock.calls[0]![0])
    expect(compiled.sql).toContain('scout_documents_fts match ?')
    expect(compiled.sql).toContain('json_extract')
    expect(compiled.sql).not.toContain('published')
    expect(compiled.params).toEqual(expect.arrayContaining(['articles', 'care', '$.status', 'published', '$.published_at', 20, 0]))
  })

  it('uses one explicit transaction for all document and FTS writes', async () => {
    const run = vi.fn()
    const transaction = vi.fn(callback => callback({ all: vi.fn(), run, transaction }))
    await new DrizzleSQLiteSearchEngine({ all: vi.fn(), run, transaction } as DrizzleSQLiteDatabase).update('articles', [document('1'), document('2')])
    expect(transaction).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledTimes(6)
  })
})

describe('TursoLibSQLSearchEngine', () => {
  it('uses @libsql statement objects and a transactional batch for multi-write sync', async () => {
    const batch = vi.fn().mockResolvedValue([])
    const engine = new TursoLibSQLSearchEngine({ execute: vi.fn(), batch } as unknown as LibSQLScoutClient)
    await engine.update('articles', [document('1'), document('2')])
    expect(batch).toHaveBeenCalledOnce()
    expect(batch.mock.calls[0]![1]).toBe('write')
    expect(batch.mock.calls[0]![0]).toHaveLength(6)
    expect(batch.mock.calls[0]![0][0]).toMatchObject({ args: ['articles', 'article', '1'] })
  })

  it('rejects non-allowlisted fields before executing remote SQL', async () => {
    const execute = vi.fn()
    const engine = new TursoLibSQLSearchEngine({ execute, batch: vi.fn() } as unknown as LibSQLScoutClient)
    await expect(engine.search({ ...request, filters: [{ field: 'tenant_id', values: ['other'] }] })).rejects.toThrow('not allowed')
    expect(execute).not.toHaveBeenCalled()
  })
})
