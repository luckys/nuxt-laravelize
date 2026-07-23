<script setup lang="ts">
import type { OperationsFiltersValue } from '../types'

const props = defineProps<{ modelValue: Readonly<OperationsFiltersValue>, sources: readonly string[], disabled?: boolean }>()
const emit = defineEmits<{ update: [name: keyof OperationsFiltersValue, value: string], search: [], reset: [] }>()
</script>

<template>
  <form
    class="filters"
    aria-label="Dead-letter filters"
    @submit.prevent="emit('search')"
  >
    <label class="field"><span>Source</span><select
      :value="props.modelValue.source"
      :disabled="props.disabled"
      @change="emit('update', 'source', ($event.target as HTMLSelectElement).value)"
    ><option
      v-for="source in props.sources"
      :key="source"
      :value="source"
    >{{ source }}</option></select></label>
    <label class="field"><span>Namespace</span><input
      :value="props.modelValue.namespace"
      maxlength="64"
      autocomplete="off"
      :disabled="props.disabled"
      @input="emit('update', 'namespace', ($event.target as HTMLInputElement).value)"
    ></label>
    <label class="field"><span>Type</span><input
      :value="props.modelValue.type"
      maxlength="128"
      autocomplete="off"
      :disabled="props.disabled"
      @input="emit('update', 'type', ($event.target as HTMLInputElement).value)"
    ></label>
    <label class="field"><span>State</span><select
      :value="props.modelValue.disposition"
      :disabled="props.disabled"
      @change="emit('update', 'disposition', ($event.target as HTMLSelectElement).value)"
    ><option value="">Any</option><option value="active">Active</option><option value="discarded">Discarded</option></select></label>
    <div class="actions">
      <button
        class="primary"
        type="submit"
        :disabled="props.disabled"
      >
        Search
      </button><button
        type="button"
        :disabled="props.disabled"
        @click="emit('reset')"
      >
        Reset
      </button>
    </div>
  </form>
</template>

<style scoped>
.filters{display:grid;grid-template-columns:repeat(4,minmax(8rem,1fr)) auto;gap:.75rem;align-items:end;padding:1rem;border:1px solid #354151;background:#111820}.field{display:grid;gap:.35rem;color:#b8c3d1;font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.field input,.field select{min-height:2.65rem;border:1px solid #536274;border-radius:2px;background:#0a1016;color:#f4f7fa;padding:.55rem .65rem;font:inherit;text-transform:none;letter-spacing:normal}.actions{display:flex;gap:.5rem}.actions button{min-height:2.65rem;border:1px solid #64748b;background:#18222d;color:#f8fafc;padding:.55rem 1rem;font-weight:800;cursor:pointer}.actions .primary{border-color:#e0a100;background:#e0a100;color:#111820}.actions button:focus-visible,.field input:focus-visible,.field select:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}.actions button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:900px){.filters{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.filters{grid-template-columns:1fr}.actions button{flex:1}}
</style>

<style scoped>
.filters,.field,.actions{min-width:0;max-width:100%;box-sizing:border-box}.field input,.field select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}.actions button{min-width:0;min-height:2.75rem;box-sizing:border-box}@media(max-width:900px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.filters{grid-template-columns:minmax(0,1fr)}}
</style>
