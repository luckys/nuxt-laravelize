import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeadLetterOperations } from '../src/runtime/composables/useDeadLetterOperations'
import type { DeadLetterKey, DeadLetterOperationsDetail } from '../src/runtime/types'

/* eslint-disable @stylistic/max-statements-per-line */
vi.mock('nuxt/app', () => ({ useRuntimeConfig: () => ({ public: { laravelizeDeadLetterOperations: { apiPath: '/api/dead' } } }) }))

const key = (id: string): DeadLetterKey => ({ source: 'queue', namespace: 'jobs', id })
const detail = (id: string): DeadLetterOperationsDetail => ({ key: key(id), type: 'mail', revision: `r-${id}`, terminalAt: '2026-01-01T00:00:00.000Z', attempts: 1, disposition: 'active', capabilities: { viewPayload: true, viewErrorSummary: false, retry: true, discard: true, scheduleRetry: true, retryInbox: false } })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('useDeadLetterOperations request safety', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('ignores a superseded detail response', async () => {
    const detailA = deferred<DeadLetterOperationsDetail>(); const detailB = deferred<DeadLetterOperationsDetail>()
    const operations = useDeadLetterOperations(vi.fn((url: string) => url.endsWith('/A') ? detailA.promise : detailB.promise) as never)
    const selectingA = operations.select(key('A')); const selectingB = operations.select(key('B'))
    detailB.resolve(detail('B')); await selectingB; detailA.resolve(detail('A')); await selectingA
    expect(operations.selected.value?.key.id).toBe('B')
    expect(operations.detailLoading.value).toBe(false)
  })

  it('ignores superseded detail and payload responses', async () => {
    const detailA = deferred<DeadLetterOperationsDetail>(); const detailB = deferred<DeadLetterOperationsDetail>(); const payloadA = deferred<DeadLetterOperationsDetail>()
    const fetcher = vi.fn((url: string) => url.endsWith('/A/payload') ? payloadA.promise : url.endsWith('/A') ? detailA.promise : detailB.promise)
    const operations = useDeadLetterOperations(fetcher as never)
    const selectingA = operations.select(key('A')); detailA.resolve(detail('A')); await selectingA
    const revealingA = operations.revealPayload(); const selectingB = operations.select(key('B'))
    payloadA.resolve({ ...detail('A'), payload: '<script>A</script>' }); await revealingA
    expect(operations.payload.value).toBeUndefined()
    detailB.resolve(detail('B')); await selectingB
    expect(operations.selected.value?.key.id).toBe('B')
    expect(operations.payload.value).toBeUndefined()
  })

  it('keeps only the newest list response and loading state', async () => {
    const oldPage = deferred<{ items: DeadLetterOperationsDetail[] }>(); const newPage = deferred<{ items: DeadLetterOperationsDetail[] }>(); let listCalls = 0
    const fetcher = vi.fn((url: string) => url.endsWith('/bootstrap') ? Promise.resolve({ sources: ['queue'], pageSize: 25, errorSummaries: false, capabilities: { viewPayload: true, viewErrorSummary: false, retry: true, discard: true, scheduleRetry: true, retryInbox: false } }) : (++listCalls === 1 ? oldPage.promise : newPage.promise))
    const operations = useDeadLetterOperations(fetcher as never)
    const first = operations.initialize(); await tick(); const second = operations.search()
    newPage.resolve({ items: [detail('new')] }); await second
    oldPage.resolve({ items: [detail('old')] }); await first
    expect(operations.items.value.map(item => item.key.id)).toEqual(['new'])
    expect(operations.loading.value).toBe(false)
  })

  it('retains an ambiguous operation, blocks duplicate submission, and retries the exact request', async () => {
    const lost = deferred<never>(); const requests: Array<{ url: string, body: unknown }> = []
    const fetcher = vi.fn((url: string, options?: { body?: unknown }) => { requests.push({ url, body: options?.body }); return requests.length === 1 ? Promise.resolve(detail('A')) : requests.length === 2 ? lost.promise : Promise.resolve({ committedAt: '2026-01-01T00:00:00.000Z' }) })
    const operations = useDeadLetterOperations(fetcher as never); await operations.select(key('A'))
    const first = operations.retry({ availableAt: '2026-01-02T00:00:00.000Z', reason: 'recover' }); void operations.retry({ availableAt: '2026-01-03T00:00:00.000Z', reason: 'duplicate' })
    expect(requests).toHaveLength(2)
    expect(operations.pendingMutation.value).toBeNull()
    lost.reject(new TypeError('response lost')); await first
    expect(operations.pendingMutation.value?.operationId).toBeTruthy()
    const originalBody = requests[1]!.body
    await operations.retrySameOperation()
    expect(requests[2]!.body).toEqual(originalBody)
  })

  it('pins selection and navigation to the ambiguous operation key until it is abandoned', async () => {
    const fetcher = vi.fn((url: string, options?: { method?: string }) => options?.method === 'POST'
      ? Promise.reject(new TypeError('response lost'))
      : Promise.resolve(detail(url.endsWith('/B') ? 'B' : 'A')))
    const operations = useDeadLetterOperations(fetcher as never); await operations.select(key('A'))
    await operations.discard({ reason: 'duplicate' })
    expect(operations.pendingMutation.value?.key).toEqual(key('A'))

    await operations.select(key('B'))
    operations.setFilter('namespace', 'other')
    await operations.search(); await operations.reset(); await operations.next(); await operations.back()

    expect(operations.selected.value?.key).toEqual(key('A'))
    expect(operations.filters.namespace).toBe('')
    await operations.retrySameOperation()
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain('/queue/jobs/A/discard')
  })
})
