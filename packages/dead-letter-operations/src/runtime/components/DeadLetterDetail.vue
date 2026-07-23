<script setup lang="ts">
import { computed } from 'vue'
import type { DeadLetterOperationsDetail } from '../types'

const props = defineProps<{ item: DeadLetterOperationsDetail | null, payload?: unknown, loading?: boolean, payloadLoading?: boolean }>()
const emit = defineEmits<{ revealPayload: [], refresh: [] }>()
const formattedPayload = computed(() => props.payload === undefined ? '' : JSON.stringify(props.payload, null, 2))
</script>

<template>
  <section
    class="detail"
    aria-labelledby="dead-letter-detail-title"
    :aria-busy="props.loading"
  >
    <div class="heading">
      <h2 id="dead-letter-detail-title">
        Inspection
      </h2><button
        v-if="props.item"
        type="button"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>
    <p
      v-if="props.loading"
      role="status"
    >
      Loading metadata…
    </p><p
      v-else-if="!props.item"
      class="muted"
    >
      Select an item to inspect metadata and operations.
    </p>
    <template v-else>
      <dl><div><dt>Source</dt><dd>{{ props.item.key.source }}</dd></div><div><dt>Namespace</dt><dd>{{ props.item.key.namespace }}</dd></div><div><dt>ID</dt><dd>{{ props.item.key.id }}</dd></div><div><dt>Type</dt><dd>{{ props.item.type }}</dd></div><div><dt>Revision</dt><dd>{{ props.item.revision }}</dd></div><div><dt>Available</dt><dd>{{ props.item.availableAt ?? 'Not scheduled' }}</dd></div></dl><p
        v-if="props.item.error"
        class="error-summary"
      >
        <strong>Error summary</strong>{{ props.item.error }}
      </p>
      <section
        v-if="props.item.capabilities.viewPayload"
        class="payload"
        aria-labelledby="payload-title"
      >
        <h3 id="payload-title">
          Sensitive payload
        </h3><p>The payload is fetched separately and never rendered into the initial page HTML.</p><button
          v-if="props.payload === undefined"
          type="button"
          :disabled="props.payloadLoading"
          @click="emit('revealPayload')"
        >
          {{ props.payloadLoading ? 'Revealing…' : 'Reveal payload' }}
        </button><pre
          v-else
          tabindex="0"
        >{{ formattedPayload }}</pre>
      </section>
    </template>
  </section>
</template>

<style scoped>
.detail{border:1px solid #354151;background:#111820;padding:1rem;color:#e7eef6}.heading{display:flex;align-items:center;justify-content:space-between;gap:1rem}.heading h2,.payload h3{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.04em}.heading h2{font-size:1.1rem}.heading button,.payload button{border:1px solid #8292a6;background:#18222d;color:#fff;padding:.45rem .7rem;font-weight:800;cursor:pointer}.heading button:focus-visible,.payload button:focus-visible,pre:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}dl{display:grid;gap:.65rem;margin:1rem 0}dl div{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:.5rem;border-bottom:1px solid #2c3946;padding-bottom:.5rem}dt{color:#9aa9ba;font-size:.7rem;font-weight:800;text-transform:uppercase}dd{margin:0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem}.muted,.payload p{color:#9eacba}.error-summary{display:grid;gap:.35rem;border-left:3px solid #e0a100;padding:.65rem;background:#1d1b12;overflow-wrap:anywhere}.payload{margin-top:1.25rem;border-top:1px solid #475569;padding-top:1rem}.payload h3{font-size:.9rem}pre{max-height:24rem;overflow:auto;border:1px solid #4b5a6b;background:#05090d;padding:.75rem;color:#d9f99d;font-size:.75rem;white-space:pre-wrap;overflow-wrap:anywhere}
</style>

<style scoped>
.detail{min-width:0;max-width:100%;box-sizing:border-box}.heading,.payload,dl,dl div,dd,pre{min-width:0;max-width:100%;box-sizing:border-box}.heading button,.payload button{min-height:2.75rem}pre{width:100%}
</style>
