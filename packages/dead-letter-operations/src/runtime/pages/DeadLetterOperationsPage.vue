<script setup lang="ts">
import { useHead } from 'nuxt/app'
import DeadLetterDetail from '../components/DeadLetterDetail.vue'
import DeadLetterMutationPanel from '../components/DeadLetterMutationPanel.vue'
import DeadLetterTable from '../components/DeadLetterTable.vue'
import OperationsFilters from '../components/OperationsFilters.vue'
import { useDeadLetterOperations } from '../composables/useDeadLetterOperations'
import type { OperationsFiltersValue } from '../types'

const operations = useDeadLetterOperations()
const updateFilter = (name: keyof OperationsFiltersValue, value: string) => operations.setFilter(name, value as never)
useHead({ title: 'Dead-letter operations', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] })
</script>

<template>
  <main class="console">
    <header class="masthead">
      <div>
        <p class="eyebrow">
          Laravelize / Reliability
        </p><h1>Dead-letter operations</h1><p>Inspect and recover failed work through explicit, authorized operations.</p>
      </div><span class="live">Live controls</span>
    </header>
    <p
      class="announcement"
      role="status"
      aria-live="polite"
    >
      {{ operations.announcement.value }}
    </p>
    <section
      v-if="operations.problem.value"
      class="problem"
      role="alert"
    >
      <strong>{{ operations.problem.value.code }}</strong><span>{{ operations.problem.value.message }}</span><button
        v-if="operations.pendingMutation.value"
        type="button"
        :disabled="operations.detailLoading.value || operations.mutationLoading.value"
        @click="operations.refreshSelected"
      >
        Refresh pending key
      </button><button
        v-else-if="operations.problem.value.ambiguous"
        type="button"
        @click="operations.refreshSelected"
      >
        Refresh before another action
      </button><button
        v-else
        type="button"
        @click="operations.initialize"
      >
        Try again
      </button>
    </section>
    <OperationsFilters
      v-if="operations.bootstrap.value"
      :model-value="operations.filters"
      :sources="operations.bootstrap.value.sources"
      :disabled="operations.loading.value || operations.mutationLoading.value || !!operations.pendingMutation.value"
      @update="updateFilter"
      @search="operations.search"
      @reset="operations.reset"
    />
    <div class="workspace">
      <section
        class="results"
        aria-labelledby="results-title"
      >
        <div class="section-heading">
          <h2 id="results-title">
            Queue ledger
          </h2><span>Page {{ operations.pageNumber.value }}</span>
        </div><DeadLetterTable
          :items="operations.items.value"
          :selected="operations.selected.value?.key"
          :loading="operations.loading.value"
          :disabled="operations.mutationLoading.value || !!operations.pendingMutation.value"
          @select="operations.select"
        /><nav
          class="pagination"
          aria-label="Result pages"
        >
          <button
            type="button"
            :disabled="!operations.canGoBack.value || operations.loading.value || operations.mutationLoading.value || !!operations.pendingMutation.value"
            @click="operations.back"
          >
            ← Previous
          </button><button
            type="button"
            :disabled="!operations.nextCursor.value || operations.loading.value || operations.mutationLoading.value || !!operations.pendingMutation.value"
            @click="operations.next"
          >
            Next →
          </button>
        </nav>
      </section><aside class="inspection">
        <DeadLetterDetail
          :item="operations.selected.value"
          :payload="operations.payload.value"
          :loading="operations.detailLoading.value"
          :payload-loading="operations.payloadLoading.value"
          @reveal-payload="operations.revealPayload"
          @refresh="operations.refreshSelected"
        />
      </aside>
    </div>
    <DeadLetterMutationPanel
      v-if="operations.selected.value"
      :key="`${operations.selected.value.key.source}:${operations.selected.value.key.namespace}:${operations.selected.value.key.id}`"
      :item="operations.selected.value"
      :loading="operations.mutationLoading.value"
      :retrying="operations.retryingMutation.value"
      :pending="operations.pendingMutation.value"
      @retry="operations.retry"
      @discard="operations.discard"
      @retry-same-operation="operations.retrySameOperation"
      @abandon="operations.abandonPendingOperation"
    />
  </main>
</template>

<style scoped>
.console{--ink:#eef3f8;min-height:100vh;box-sizing:border-box;background:radial-gradient(circle at 80% 0,#153041 0,transparent 28rem),#070c11;color:var(--ink);padding:clamp(1rem,3vw,2.5rem);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.masthead{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start;border-top:5px solid #e0a100;padding:1.5rem 0 1.25rem}.masthead h1{margin:.15rem 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:clamp(2rem,5vw,4.5rem);line-height:.95;letter-spacing:-.07em;text-transform:uppercase}.masthead p{max-width:48rem;color:#a9b6c4}.eyebrow{margin:0!important;color:#fbbf24!important;font-size:.72rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.live{border:1px solid #22d3ee;padding:.35rem .55rem;color:#67e8f9;font-size:.7rem;font-weight:900;text-transform:uppercase;white-space:nowrap}.announcement:empty{display:none}.announcement{min-height:1.25rem;color:#a7f3d0}.problem{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;border:2px solid #ef4444;background:#2a1014;padding:.8rem;color:#fecaca}.problem strong{text-transform:uppercase}.problem button{margin-left:auto;border:1px solid currentColor;background:transparent;color:inherit;padding:.45rem .7rem;font-weight:800}.workspace{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(18rem,.7fr);gap:1rem;margin:1rem 0}.section-heading{display:flex;align-items:center;justify-content:space-between;padding:.75rem 0}.section-heading h2{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;font-size:1rem;letter-spacing:.05em}.section-heading span{color:#94a3b8;font-size:.75rem}.pagination{display:flex;justify-content:space-between;padding-top:.75rem}.pagination button{border:1px solid #64748b;background:#111820;color:#fff;padding:.55rem .8rem;font-weight:800;cursor:pointer}.pagination button:disabled{opacity:.35;cursor:not-allowed}.pagination button:focus-visible,.problem button:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}@media(max-width:920px){.workspace{grid-template-columns:1fr}.inspection{order:-1}}@media(max-width:520px){.console{padding:.75rem}.masthead{display:block}.live{display:inline-block;margin-top:.5rem}}@media(prefers-reduced-motion:reduce){.console *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
</style>

<style scoped>
.console{width:100%;max-width:100%;overflow-x:clip}.console,.console>*{box-sizing:border-box}.masthead>div,.problem,.workspace,.results,.inspection{min-width:0;max-width:100%}.problem{box-sizing:border-box;overflow-wrap:anywhere}.section-heading{min-width:0;max-width:100%;gap:.75rem}.section-heading h2{min-width:0;overflow-wrap:anywhere}.section-heading span{flex:0 0 auto;white-space:nowrap}.pagination{width:100%;max-width:100%;box-sizing:border-box;gap:.75rem}.pagination button,.problem button{min-height:2.75rem;box-sizing:border-box}@media(max-width:920px){.results{order:1}.inspection{order:2}.workspace{grid-template-columns:minmax(0,1fr)}}@media(max-width:700px){.pagination button{min-width:0;flex:1;padding:.55rem .5rem}}@media(max-width:420px){.problem{align-items:stretch;flex-wrap:wrap}.problem button{width:100%;margin-left:0}}
</style>
