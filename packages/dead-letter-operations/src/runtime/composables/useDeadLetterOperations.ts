/* eslint-disable @stylistic/max-statements-per-line */
import { useRuntimeConfig } from 'nuxt/app'
import { computed, onMounted, reactive, readonly, shallowRef } from 'vue'
import type { DeadLetterCapabilities, DeadLetterKey, DeadLetterMutationResult, DeadLetterOperationsDetail, DeadLetterSummary, OperationsFiltersValue, OperationsProblem, PendingDeadLetterMutation, RetryInput } from '../types'

interface Bootstrap { sources: string[], pageSize: number, errorSummaries: boolean, sourceCapabilities?: Record<string, DeadLetterCapabilities>, capabilities: DeadLetterCapabilities }
interface Page { items: DeadLetterSummary[], nextCursor?: string }
type Fetcher = typeof $fetch

const messageFor = (code: string): OperationsProblem => ({ code, message: ({ forbidden: 'You are not authorized to perform this operation.', no_adapters: 'No dead-letter adapters are registered.', stale_revision: 'This item changed. Refresh before trying again.', invalid_state: 'This operation is not valid for the current item state.', operation_conflict: 'This operation identifier was already used differently.', unmanaged_legacy: 'This legacy item requires administrator migration.', ambiguous_outcome: 'The outcome is unknown. Refresh the item before taking any further action.', unavailable: 'Dead-letter operations are temporarily unavailable.', not_found: 'The item no longer exists.', invalid_request: 'The request was rejected.' } as Record<string, string>)[code] ?? 'The operation could not be completed.', ...(code === 'ambiguous_outcome' ? { ambiguous: true } : {}) })

export function useDeadLetterOperations(fetcher: Fetcher = $fetch) {
  const runtime = useRuntimeConfig()
  const apiPath = String((runtime.public.laravelizeDeadLetterOperations as { apiPath?: string } | undefined)?.apiPath ?? '')
  const bootstrap = shallowRef<Bootstrap | null>(null)
  const items = shallowRef<readonly DeadLetterSummary[]>([])
  const selected = shallowRef<DeadLetterOperationsDetail | null>(null)
  const payload = shallowRef<unknown>(undefined)
  const filters = reactive<OperationsFiltersValue>({ source: '', namespace: '', type: '', disposition: '' })
  const appliedFilters = shallowRef<OperationsFiltersValue>({ ...filters })
  const cursorStack = shallowRef<readonly (string | undefined)[]>([undefined])
  const nextCursor = shallowRef<string | undefined>()
  const loading = shallowRef(false)
  const detailLoading = shallowRef(false)
  const payloadLoading = shallowRef(false)
  const mutationLoading = shallowRef(false)
  const retryingMutation = shallowRef(false)
  const pendingMutation = shallowRef<PendingDeadLetterMutation | null>(null)
  const problem = shallowRef<OperationsProblem | null>(null)
  const announcement = shallowRef('')
  const pageNumber = computed(() => cursorStack.value.length)
  const canGoBack = computed(() => cursorStack.value.length > 1)
  let bootstrapRequest: AbortController | undefined
  let listRequest: AbortController | undefined
  let detailRequest: AbortController | undefined
  let payloadRequest: AbortController | undefined
  let bootstrapGeneration = 0; let listGeneration = 0; let detailGeneration = 0; let payloadGeneration = 0

  function capture(error: unknown): void {
    const code = String((error as { data?: { data?: { code?: string }, code?: string } })?.data?.data?.code ?? (error as { data?: { code?: string } })?.data?.code ?? 'unknown')
    problem.value = messageFor(code)
  }
  async function loadPage(): Promise<void> {
    const generation = ++listGeneration; listRequest?.abort(); listRequest = new AbortController()
    loading.value = true; problem.value = null
    try {
      const current = cursorStack.value.at(-1)
      const values = appliedFilters.value
      const page = await fetcher<Page>(apiPath, { signal: listRequest.signal, query: { source: values.source, ...(values.namespace ? { namespace: values.namespace } : {}), ...(values.type ? { type: values.type } : {}), ...(values.disposition ? { disposition: values.disposition } : {}), ...(current ? { cursor: current } : {}) } })
      if (generation !== listGeneration) return
      items.value = page.items; nextCursor.value = page.nextCursor
      if (selected.value && !page.items.some(item => sameKey(item.key, selected.value!.key))) clearSelection()
      announcement.value = `${page.items.length} dead-letter items loaded.`
    }
    catch (error) { if (generation === listGeneration && !listRequest.signal.aborted) { items.value = []; capture(error) } }
    finally { if (generation === listGeneration) loading.value = false }
  }
  async function initialize(): Promise<void> {
    const generation = ++bootstrapGeneration; bootstrapRequest?.abort(); bootstrapRequest = new AbortController()
    loading.value = true; problem.value = null
    try {
      const result = await fetcher<Bootstrap>(`${apiPath}/bootstrap`, { signal: bootstrapRequest.signal })
      if (generation !== bootstrapGeneration) return
      bootstrap.value = result
      filters.source = bootstrap.value.sources[0] ?? ''
      appliedFilters.value = { ...filters }
      await loadPage()
    }
    catch (error) { if (generation === bootstrapGeneration && !bootstrapRequest.signal.aborted) capture(error) }
    finally { if (generation === bootstrapGeneration && listGeneration === 0) loading.value = false }
  }
  async function search(): Promise<void> { if (mutationLoading.value || pendingMutation.value) return; appliedFilters.value = { ...filters }; cursorStack.value = [undefined]; clearSelection(); await loadPage() }
  async function reset(): Promise<void> { if (mutationLoading.value || pendingMutation.value) return; Object.assign(filters, { source: bootstrap.value?.sources[0] ?? '', namespace: '', type: '', disposition: '' }); await search() }
  async function next(): Promise<void> { if (mutationLoading.value || pendingMutation.value || !nextCursor.value) return; cursorStack.value = [...cursorStack.value, nextCursor.value]; clearSelection(); await loadPage() }
  async function back(): Promise<void> { if (mutationLoading.value || pendingMutation.value || !canGoBack.value) return; cursorStack.value = cursorStack.value.slice(0, -1); clearSelection(); await loadPage() }
  function clearSelection(): void { detailRequest?.abort(); payloadRequest?.abort(); ++detailGeneration; ++payloadGeneration; selected.value = null; payload.value = undefined; payloadLoading.value = false; detailLoading.value = false }
  async function select(key: DeadLetterKey): Promise<void> {
    if (mutationLoading.value || (pendingMutation.value && !sameKey(pendingMutation.value.key, key))) return
    const generation = ++detailGeneration; detailRequest?.abort(); detailRequest = new AbortController(); payloadRequest?.abort(); ++payloadGeneration
    if (!pendingMutation.value) selected.value = null
    payload.value = undefined; payloadLoading.value = false; detailLoading.value = true; problem.value = null
    try { const result = await fetcher<DeadLetterOperationsDetail>(itemUrl(key), { signal: detailRequest.signal }); if (generation === detailGeneration) selected.value = result }
    catch (error) { if (generation === detailGeneration && !detailRequest.signal.aborted) capture(error) }
    finally { if (generation === detailGeneration) detailLoading.value = false }
  }
  async function revealPayload(): Promise<void> {
    if (!selected.value) return
    const selectedKey = selected.value.key; const generation = ++payloadGeneration; payloadRequest?.abort(); payloadRequest = new AbortController()
    payload.value = undefined; payloadLoading.value = true; problem.value = null
    try { const result = await fetcher<DeadLetterOperationsDetail>(`${itemUrl(selectedKey)}/payload`, { signal: payloadRequest.signal }); if (generation === payloadGeneration && selected.value && sameKey(selected.value.key, selectedKey)) payload.value = result.payload }
    catch (error) { if (generation === payloadGeneration && !payloadRequest.signal.aborted) { payload.value = undefined; capture(error) } }
    finally { if (generation === payloadGeneration) payloadLoading.value = false }
  }
  async function submitMutation(request: PendingDeadLetterMutation): Promise<void> {
    if (mutationLoading.value) return
    mutationLoading.value = true; problem.value = null
    const body = { revision: request.revision, operationId: request.operationId, ...(request.input.reason ? { reason: request.input.reason } : {}), ...(request.action === 'retry' ? { availableAt: (request.input as RetryInput).availableAt } : {}) }
    try {
      const result = await fetcher<DeadLetterMutationResult>(`${itemUrl(request.key)}/${request.action}`, { method: 'POST', retry: 0, headers: { 'content-type': 'application/json', 'x-laravelize-operations': '1' }, body })
      pendingMutation.value = null
      announcement.value = `${request.action === 'retry' ? 'Retry scheduled' : 'Item discarded'} at ${result.committedAt}.`
      clearSelection(); await loadPage()
    }
    catch (error) {
      const code = String((error as { data?: { data?: { code?: string }, code?: string } })?.data?.data?.code ?? (error as { data?: { code?: string } })?.data?.code ?? 'unknown')
      if (code === 'unknown' || code === 'ambiguous_outcome') pendingMutation.value = request
      else pendingMutation.value = null
      capture(code === 'unknown' ? { data: { code: 'ambiguous_outcome' } } : error)
    }
    finally { mutationLoading.value = false }
  }
  async function mutate(action: 'retry' | 'discard', input: RetryInput | { reason: string }): Promise<void> {
    if (!selected.value || mutationLoading.value || pendingMutation.value) return
    const request: PendingDeadLetterMutation = Object.freeze({ action, key: Object.freeze({ ...selected.value.key }), revision: selected.value.revision, input: Object.freeze({ ...input }), operationId: crypto.randomUUID() })
    await submitMutation(request)
  }
  const retrySameOperation = async () => {
    if (!pendingMutation.value || mutationLoading.value) return
    retryingMutation.value = true
    try { await submitMutation(pendingMutation.value) }
    finally { retryingMutation.value = false }
  }
  const abandonPendingOperation = () => { if (!mutationLoading.value) { pendingMutation.value = null; problem.value = null } }
  const retry = (input: RetryInput) => mutate('retry', input)
  const discard = (input: { reason: string }) => mutate('discard', input)
  const refreshSelected = async () => { if (pendingMutation.value) await select(pendingMutation.value.key); else if (selected.value) await select(selected.value.key); else await loadPage() }
  const itemUrl = (key: DeadLetterKey) => `${apiPath}/${encodeURIComponent(key.source)}/${encodeURIComponent(key.namespace)}/${encodeURIComponent(key.id)}`
  const sameKey = (left: DeadLetterKey, right: DeadLetterKey) => left.source === right.source && left.namespace === right.namespace && left.id === right.id

  onMounted(initialize)
  return { bootstrap: readonly(bootstrap), items: readonly(items), selected: readonly(selected), payload: readonly(payload), pendingMutation: readonly(pendingMutation), filters: readonly(filters), loading: readonly(loading), detailLoading: readonly(detailLoading), payloadLoading: readonly(payloadLoading), mutationLoading: readonly(mutationLoading), retryingMutation: readonly(retryingMutation), problem: readonly(problem), announcement: readonly(announcement), pageNumber, canGoBack, nextCursor: readonly(nextCursor), setFilter: <K extends keyof OperationsFiltersValue>(name: K, value: OperationsFiltersValue[K]) => { if (!mutationLoading.value && !pendingMutation.value) filters[name] = value }, initialize, search, reset, next, back, select, revealPayload, retry, discard, retrySameOperation, abandonPendingOperation, refreshSelected }
}
